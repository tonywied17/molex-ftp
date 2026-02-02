const { normalizePath, getParentDir, parseMdtmResponse } = require('./utils');
const { createOptimizedSocket } = require('./performance');

/**
 * FTP command implementations
 */
class FTPCommands {
  constructor(client) {
    this.client = client;
    this.connection = client._connection;
  }

  /**
   * Upload file to FTP server
   * @param {string|Buffer} data - File data
   * @param {string} remotePath - Remote file path
   * @param {boolean} ensureDir - Ensure parent directory exists (default: false)
   * @returns {Promise<void>}
   */
  async upload(data, remotePath, ensureDir = false) {
    if (!this.client.connected || !this.client.authenticated) {
      throw new Error('Not connected to FTP server');
    }
    if (ensureDir) {
      await this.ensureDir(remotePath, true, true);
    }
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    this.client._debug(`Uploading ${buffer.length} bytes to ${remotePath}`);
    const { host, port } = await this.connection.enterPassiveMode();

    return new Promise((resolve, reject) => {
      let commandSent = false;

      this.client.dataSocket = createOptimizedSocket({ host, port }, () => {
        // Send STOR command to start upload (expects 150, then 226)
        if (!commandSent) {
          commandSent = true;
          this.client._debug(`Data connection established for upload`);
          this.connection.sendCommand(`STOR ${remotePath}`, true).catch(reject);
          
          // Write data to data socket
          this.client.dataSocket.write(buffer);
          this.client.dataSocket.end();
        }
      });

      this.client.dataSocket.on('error', reject);

      this.client.dataSocket.on('close', () => {
        // Wait for final response from control socket
        const finalHandler = (line) => {
          const code = parseInt(line.substring(0, 3));
          if (code === 226 || code === 250) {
            this.client.removeListener('response', finalHandler);
            this.client._debug(`Upload completed successfully`);
            resolve();
          } else if (code >= 400) {
            this.client.removeListener('response', finalHandler);
            reject(new Error(`Upload failed - FTP Error ${code}: ${line.substring(4)} (path: ${remotePath})`));
          }
        };
        this.client.on('response', finalHandler);
        
        // Timeout if no response
        setTimeout(() => {
          this.client.removeListener('response', finalHandler);
          resolve();
        }, this.client.timeout || 5000);
      });
    });
  }

  /**
   * Download file from FTP server
   * @param {string} remotePath - Remote file path
   * @returns {Promise<Buffer>}
   */
  async download(remotePath) {
    if (!this.client.connected || !this.client.authenticated) {
      throw new Error('Not connected to FTP server');
    }
    this.client._debug(`Downloading ${remotePath}`);
    const { host, port } = await this.connection.enterPassiveMode();

    return new Promise((resolve, reject) => {
      const chunks = [];
      let commandSent = false;

      this.client.dataSocket = createOptimizedSocket({ host, port }, () => {
        // Send RETR command to start download (expects 150, then 226)
        if (!commandSent) {
          commandSent = true;
          this.client._debug(`Data connection established for download`);
          this.connection.sendCommand(`RETR ${remotePath}`, true).catch(reject);
        }
      });

      this.client.dataSocket.on('data', (chunk) => {
        chunks.push(chunk);
        this.client._debug(`Received ${chunk.length} bytes`);
      });

      this.client.dataSocket.on('error', reject);

      this.client.dataSocket.on('close', () => {
        // Wait for final 226 response
        const finalHandler = (line) => {
          const code = parseInt(line.substring(0, 3));
          if (code === 226 || code === 250) {
            this.client.removeListener('response', finalHandler);
            const result = Buffer.concat(chunks);
            this.client._debug(`Download completed: ${result.length} bytes`);
            resolve(result);
          } else if (code >= 400) {
            this.client.removeListener('response', finalHandler);
            reject(new Error(`Download failed - FTP Error ${code}: ${line.substring(4)} (path: ${remotePath})`));
          }
        };
        this.client.on('response', finalHandler);
        
        // Timeout if no response
        setTimeout(() => {
          this.client.removeListener('response', finalHandler);
          if (chunks.length > 0) {
            resolve(Buffer.concat(chunks));
          }
        }, this.client.timeout || 5000);
      });
    });
  }

  /**
   * Download file from FTP server as a stream
   * More memory efficient for large files
   * @param {string} remotePath - Remote file path
   * @param {Stream} writeStream - Writable stream to pipe data to
   * @returns {Promise<number>} - Total bytes transferred
   */
  async downloadStream(remotePath, writeStream) {
    if (!this.client.connected || !this.client.authenticated) {
      throw new Error('Not connected to FTP server');
    }
    this.client._debug(`Streaming download: ${remotePath}`);
    const { host, port } = await this.connection.enterPassiveMode();

    return new Promise((resolve, reject) => {
      let totalBytes = 0;
      let commandSent = false;

      this.client.dataSocket = createOptimizedSocket({ host, port }, () => {
        if (!commandSent) {
          commandSent = true;
          this.client._debug(`Data connection established for streaming download`);
          this.connection.sendCommand(`RETR ${remotePath}`, true).catch(reject);
        }
      });

      this.client.dataSocket.on('data', (chunk) => {
        totalBytes += chunk.length;
        writeStream.write(chunk);
      });

      this.client.dataSocket.on('error', (err) => {
        writeStream.end();
        reject(err);
      });

      this.client.dataSocket.on('close', () => {
        // Wait for final 226 response
        const finalHandler = (line) => {
          const code = parseInt(line.substring(0, 3));
          if (code === 226 || code === 250) {
            this.client.removeListener('response', finalHandler);
            writeStream.end();
            this.client._debug(`Streaming download completed: ${totalBytes} bytes`);
            resolve(totalBytes);
          } else if (code >= 400) {
            this.client.removeListener('response', finalHandler);
            writeStream.end();
            reject(new Error(`Download failed - FTP Error ${code}: ${line.substring(4)} (path: ${remotePath})`));
          }
        };
        this.client.on('response', finalHandler);
        
        // Timeout if no response
        setTimeout(() => {
          this.client.removeListener('response', finalHandler);
          if (totalBytes > 0) {
            writeStream.end();
            resolve(totalBytes);
          } else {
            writeStream.end();
            reject(new Error('Download timeout'));
          }
        }, this.client.timeout || 5000);
      });
    });
  }

  /**
   * List directory contents
   * @param {string} [path='.'] - Directory path
   * @returns {Promise<string>}
   */
  async list(path = '.') {
    this.client._debug(`Listing directory: ${path}`);
    const { host, port } = await this.connection.enterPassiveMode();

    return new Promise((resolve, reject) => {
      const chunks = [];
      let commandSent = false;

      this.client.dataSocket = createOptimizedSocket({ host, port }, () => {
        if (!commandSent) {
          commandSent = true;
          this.connection.sendCommand(`LIST ${path}`, true).catch(reject);
        }
      });

      this.client.dataSocket.on('data', (chunk) => {
        chunks.push(chunk);
      });

      this.client.dataSocket.on('error', reject);

      this.client.dataSocket.on('close', () => {
        // Wait for final 226 response
        const finalHandler = (line) => {
          const code = parseInt(line.substring(0, 3));
          if (code === 226 || code === 250) {
            this.client.removeListener('response', finalHandler);
            resolve(Buffer.concat(chunks).toString('utf8'));
          }
        };
        this.client.on('response', finalHandler);
        
        // Timeout fallback
        setTimeout(() => {
          this.client.removeListener('response', finalHandler);
          resolve(Buffer.concat(chunks).toString('utf8'));
        }, this.client.timeout || 3000);
      });
    });
  }

  /**
   * Change working directory
   * @param {string} path - Directory path
   * @returns {Promise<void>}
   */
  async cd(path) {
    await this.connection.sendCommand(`CWD ${path}`);
  }

  /**
   * Get current working directory
   * @returns {Promise<string>}
   */
  async pwd() {
    const response = await this.connection.sendCommand('PWD');
    const match = response.message.match(/"(.+)"/);
    return match ? match[1] : '/';
  }

  /**
   * Create directory
   * @param {string} path - Directory path
   * @returns {Promise<void>}
   */
  async mkdir(path) {
    await this.connection.sendCommand(`MKD ${path}`);
  }

  /**
   * Delete file
   * @param {string} path - File path
   * @returns {Promise<void>}
   */
  async delete(path) {
    await this.connection.sendCommand(`DELE ${path}`);
  }

  /**
   * Rename file
   * @param {string} from - Current name
   * @param {string} to - New name
   * @returns {Promise<void>}
   */
  async rename(from, to) {
    await this.connection.sendCommand(`RNFR ${from}`);
    await this.connection.sendCommand(`RNTO ${to}`);
  }

  /**
   * Get file size
   * @param {string} path - File path
   * @returns {Promise<number>}
   */
  async size(path) {
    this.client._debug(`Getting size of ${path}`);
    const response = await this.connection.sendCommand(`SIZE ${path}`);
    return parseInt(response.message);
  }

  /**
   * Check if file or directory exists
   * @param {string} path - File or directory path
   * @returns {Promise<boolean>}
   */
  async exists(path) {
    const info = await this.stat(path);
    return info.exists;
  }

  /**
   * Get file/directory information
   * @param {string} path - Path to check
   * @returns {Promise<Object>} - { exists, size, isFile, isDirectory }
   */
  async stat(path) {
    try {
      // First try SIZE command (works for files)
      const size = await this.size(path);
      return { exists: true, size, isFile: true, isDirectory: false };
    } catch (err) {
      // SIZE failed, might be a directory - try CWD
      try {
        const currentDir = await this.pwd();
        await this.cd(path);
        // Restore original directory
        await this.cd(currentDir);
        return { exists: true, size: null, isFile: false, isDirectory: true };
      } catch (cdErr) {
        // Both SIZE and CWD failed - try listing parent directory
        try {
          const dir = getParentDir(path);
          const basename = path.split('/').pop();
          const listing = await this.list(dir);
          const found = listing.split('\n').some(line => line.includes(basename));
          return { exists: found, size: null, isFile: null, isDirectory: null };
        } catch (listErr) {
          return { exists: false, size: null, isFile: null, isDirectory: null };
        }
      }
    }
  }

  /**
   * Ensure directory exists, creating it if necessary
   * @param {string} dirPath - Directory or file path to ensure exists
   * @param {boolean} recursive - Create parent directories if needed (default: true)
   * @param {boolean} isFilePath - If true, ensures parent directory of file path (default: false)
   * @returns {Promise<void>}
   */
  async ensureDir(dirPath, recursive = true, isFilePath = false) {
    // If this is a file path, extract the parent directory
    const targetPath = isFilePath ? getParentDir(dirPath) : dirPath;
    if (!targetPath || targetPath === '.' || targetPath === '/') {
      return; // Root or current directory always exists
    }
    
    this.client._debug(`Ensuring directory exists: ${targetPath}`);
    
    // Normalize path
    const normalized = normalizePath(targetPath);
    if (normalized === '/' || normalized === '.') {
      return; // Root or current directory always exists
    }

    // Try to cd to the directory
    try {
      await this.cd(normalized);
      this.client._debug(`Directory already exists: ${normalized}`);
      return;
    } catch (err) {
      this.client._debug(`Directory doesn't exist: ${normalized}`);
    }

    // If recursive, ensure parent directory exists first
    if (recursive) {
      const parentDir = normalized.substring(0, normalized.lastIndexOf('/')) || '/';
      if (parentDir !== '/' && parentDir !== '.') {
        await this.ensureDir(parentDir, true);
      }
    }

    // Create the directory
    try {
      await this.mkdir(normalized);
      this.client._debug(`Created directory: ${normalized}`);
    } catch (err) {
      // Ignore error if directory was created by another process
      if (!err.message.includes('550') && !err.message.includes('exists')) {
        throw err;
      }
    }
  }

  /**
   * Get file modification time
   * @param {string} path - File path
   * @returns {Promise<Date>}
   */
  async modifiedTime(path) {
    this.client._debug(`Getting modification time of ${path}`);
    const response = await this.connection.sendCommand(`MDTM ${path}`);
    return parseMdtmResponse(response.message);
  }
}

module.exports = FTPCommands;
