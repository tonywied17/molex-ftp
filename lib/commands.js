const { normalizePath, getParentDir, parseMdtmResponse } = require('./utils');
const { createOptimizedSocket } = require('./performance');
const fs = require('fs');

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
      await this.ensureDir(remotePath);
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
          // Just send command, don't wait for completion
          this.client.socket.write(`STOR ${remotePath}\r\n`);
          this.client._commandCount++;
          
          // Write data to data socket
          this.client.dataSocket.write(buffer);
          this.client.dataSocket.end();
        }
      });

      this.client.dataSocket.on('error', reject);

      this.client.dataSocket.on('close', () => {
        // Upload complete
        this.client._debug(`Upload completed successfully`);
        // Small delay to let 226 response arrive before next command
        setTimeout(() => resolve(), 10);
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
      let dataComplete = false;
      let commandComplete = false;

      const checkComplete = () => {
        if (dataComplete && commandComplete) {
          const result = Buffer.concat(chunks);
          this.client._debug(`Download completed: ${result.length} bytes`);
          resolve(result);
        }
      };

      this.client.dataSocket = createOptimizedSocket({ host, port }, () => {
        // Send RETR command to start download (expects 150, then 226)
        if (!commandSent) {
          commandSent = true;
          this.client._debug(`Data connection established for download`);
          // Just send command, don't wait for completion - data socket will handle it
          this.client.socket.write(`RETR ${remotePath}\r\n`);
          this.client._commandCount++;
        }
      });

      this.client.dataSocket.on('data', (chunk) => {
        chunks.push(chunk);
      });

      this.client.dataSocket.on('error', reject);

      this.client.dataSocket.on('close', () => {
        // Data transfer complete, resolve immediately
        const result = Buffer.concat(chunks);
        this.client._debug(`Download completed: ${result.length} bytes`);
        // Small delay to let 226 response arrive before next command
        setTimeout(() => resolve(result), 10);
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
          // Just send command, don't wait for completion
          this.client.socket.write(`RETR ${remotePath}\r\n`);
          this.client._commandCount++;
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
        // Streaming complete
        writeStream.end();
        this.client._debug(`Streaming download completed: ${totalBytes} bytes`);
        // Small delay to let 226 response arrive before next command
        setTimeout(() => resolve(totalBytes), 10);
      });
    });
  }

  /**
   * Upload local file to FTP server
   * @param {string} localPath - Local file path
   * @param {string} remotePath - Remote file path
   * @param {boolean} ensureDir - Ensure parent directory exists (default: true)
   * @returns {Promise<void>}
   */
  async uploadFile(localPath, remotePath, ensureDir = true) {
    if (!fs.existsSync(localPath)) {
      throw new Error(`Local file not found: ${localPath}`);
    }
    const data = fs.readFileSync(localPath);
    return this.upload(data, remotePath, ensureDir);
  }

  /**
   * Download file from FTP server to local disk
   * @param {string} remotePath - Remote file path
   * @param {string} localPath - Local file path
   * @returns {Promise<number>} - Total bytes transferred
   */
  async downloadFile(remotePath, localPath) {
    const writeStream = fs.createWriteStream(localPath);
    return this.downloadStream(remotePath, writeStream);
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
          // Just send command, don't wait for completion
          this.client.socket.write(`LIST ${path}\r\n`);
          this.client._commandCount++;
        }
      });

      this.client.dataSocket.on('data', (chunk) => {
        chunks.push(chunk);
      });

      this.client.dataSocket.on('error', reject);

      this.client.dataSocket.on('close', () => {
        // Data transfer complete, resolve immediately
        // Small delay to let 226 response arrive before next command
        setTimeout(() => resolve(Buffer.concat(chunks).toString('utf8')), 10);
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
   * Remove directory
   * @param {string} path - Directory path
   * @param {boolean} recursive - Delete all contents recursively (default: false)
   * @returns {Promise<void>}
   */
  async removeDir(path, recursive = false) {
    if (!recursive) {
      // Remove empty directory only
      await this.connection.sendCommand(`RMD ${path}`);
      return;
    }

    // Recursive delete - get contents and delete everything
    try {
      const listing = await this.list(path);
      const lines = listing.split('\n').filter(line => line.trim());
      
      // Process each line - faster than listDetailed
      for (const line of lines) {
        // Skip . and .. and empty lines
        if (!line || line.includes(' .') || line.includes(' ..')) continue;
        
        // Extract filename (last part of line)
        const parts = line.trim().split(/\s+/);
        const name = parts[parts.length - 1];
        if (name === '.' || name === '..') continue;
        
        const fullPath = `${path}/${name}`.replace(/\/+/g, '/');
        const isDir = line.startsWith('d');
        
        if (isDir) {
          // Directory - recurse
          await this.removeDir(fullPath, true);
        } else {
          // File - delete
          try {
            await this.delete(fullPath);
          } catch (err) {
            this.client._debug(`Could not delete file ${fullPath}: ${err.message}`);
          }
        }
      }
      
      // Remove the now-empty directory
      await this.connection.sendCommand(`RMD ${path}`);
    } catch (err) {
      throw new Error(`Failed to remove directory ${path}: ${err.message}`);
    }
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
   * Auto-detects if path is a file (has extension) and ensures parent directory
   * @param {string} path - Directory path or file path to ensure exists
   * @param {boolean} recursive - Create parent directories if needed (default: true)
   * @returns {Promise<void>}
   */
  async ensureDir(path, recursive = true) {
    // Auto-detect if this is a file path by checking for extension
    const isFilePath = /\.[^./\\]+$/.test(path);
    // If this is a file path, extract the parent directory
    const targetPath = isFilePath ? getParentDir(path) : path;
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

  /**
   * Change file permissions (Unix/Linux servers only)
   * @param {string} path - File or directory path
   * @param {string|number} mode - Permissions (e.g., '755', 0755, or 'rwxr-xr-x')
   * @returns {Promise<void>}
   */
  async chmod(path, mode) {
    // Convert numeric mode to octal string if needed
    const modeStr = typeof mode === 'number' ? mode.toString(8) : String(mode).replace(/[^0-7]/g, '');
    
    if (!/^[0-7]{3,4}$/.test(modeStr)) {
      throw new Error(`Invalid chmod mode: ${mode}. Use octal format like '755' or 0755`);
    }

    this.client._debug(`Changing permissions of ${path} to ${modeStr}`);
    await this.connection.sendCommand(`SITE CHMOD ${modeStr} ${path}`);
  }

  /**
   * Execute a SITE command (server-specific commands)
   * @param {string} command - SITE command to execute (without 'SITE' prefix)
   * @returns {Promise<Object>}
   */
  async site(command) {
    this.client._debug(`Executing SITE command: ${command}`);
    return await this.connection.sendCommand(`SITE ${command}`);
  }

  /**
   * Parse directory listing into structured objects
   * @param {string} path - Directory path
   * @returns {Promise<Array>} Array of file/directory objects
   */
  async listDetailed(path = '.') {
    const listing = await this.list(path);
    const lines = listing.split('\n').filter(line => line.trim() && !line.startsWith('total'));
    
    return lines.map(line => {
      // Parse Unix-style LIST format
      const match = line.match(/^([drwxlst-]{10})\s+(\d+)\s+(\S+)\s+(\S+)\s+(\d+)\s+(\S+\s+\S+\s+\S+)\s+(.+)$/);
      
      if (match) {
        const [, perms, links, owner, group, size, date, name] = match;
        return {
          name,
          type: perms[0] === 'd' ? 'directory' : (perms[0] === 'l' ? 'symlink' : 'file'),
          permissions: perms,
          owner,
          group,
          size: parseInt(size),
          date,
          raw: line
        };
      }
      
      // Fallback for non-standard formats - try to extract name
      const parts = line.trim().split(/\s+/);
      return { 
        name: parts[parts.length - 1], 
        type: 'unknown',
        raw: line 
      };
    }).filter(item => item.name && item.name !== '.' && item.name !== '..');
  }
}

module.exports = FTPCommands;
