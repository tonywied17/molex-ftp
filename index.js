const net = require('net');
const { EventEmitter } = require('events');

/**
 * Lightweight FTP Client using native Node.js TCP sockets (net module)
 */
class FTPClient extends EventEmitter {
  constructor(options = {}) {
    super();
    this.socket = null;
    this.dataSocket = null;
    this.buffer = '';
    this.connected = false;
    this.authenticated = false;
    this.debug = options.debug || false;
    this.timeout = options.timeout || 30000;
    this.keepAlive = options.keepAlive !== false;
    this._log = options.logger || console.log;
    this._commandCount = 0;
    this._lastCommand = null;
  }

  /**
   * Log message if debug is enabled
   * @private
   */
  _debug(...args) {
    if (this.debug && this._log) {
      this._log('[FTP Debug]', ...args);
    }
  }

  /**
   * Connect to FTP server
   * @param {Object} options - Connection options
   * @param {string} options.host - FTP server host
   * @param {number} [options.port=21] - FTP server port
   * @param {string} [options.user='anonymous'] - Username
   * @param {string} [options.password='anonymous@'] - Password
   * @returns {Promise<void>}
   */
  async connect({ host, port = 21, user = 'anonymous', password = 'anonymous@' }) {
    this._debug(`Connecting to ${host}:${port} as ${user}`);
    return new Promise((resolve, reject) => {
      this.socket = net.createConnection({ host, port }, () => {
        this.connected = true;
        this._debug('TCP connection established');
        if (this.keepAlive) {
          this.socket.setKeepAlive(true, 10000);
        }
        this.emit('connected');
      });

      this.socket.setEncoding('utf8');
      this.socket.on('data', async (data) => {
        this.buffer += data;
        const lines = this.buffer.split('\r\n');
        this.buffer = lines.pop();

        for (const line of lines) {
          if (line) {
            this._debug('<<<', line);
            this.emit('response', line);
            const code = parseInt(line.substring(0, 3));

            // Handle initial connection
            if (code === 220 && !this.authenticated) {
              try {
                this._debug('Authenticating...');
                await this._sendCommand(`USER ${user}`);
                await this._sendCommand(`PASS ${password}`);
                this.authenticated = true;
                this._debug('Authentication successful');
                resolve();
              } catch (err) {
                reject(err);
              }
            }
          }
        }
      });

      this.socket.on('error', (err) => {
        this.emit('error', err);
        reject(err);
      });

      this.socket.on('close', () => {
        this.connected = false;
        this.authenticated = false;
        this.emit('close');
      });

      setTimeout(() => reject(new Error('Connection timeout')), 10000);
    });
  }

  /**
   * Send FTP command and wait for response
   * @param {string} command - FTP command
   * @param {boolean} allowPreliminary - Allow 1xx preliminary responses
   * @returns {Promise<Object>}
   */
  _sendCommand(command, allowPreliminary = false) {
    return new Promise((resolve, reject) => {
      if (!this.connected) {
        return reject(new Error('Not connected'));
      }

      this._commandCount++;
      this._lastCommand = command;
      const cmdToLog = command.startsWith('PASS ') ? 'PASS ********' : command;
      this._debug('>>>', cmdToLog);

      const timeoutId = setTimeout(() => {
        this.removeListener('response', responseHandler);
        reject(new Error(`Command timeout: ${cmdToLog}`));
      }, this.timeout);

      const responseHandler = (line) => {
        clearTimeout(timeoutId);
        const code = parseInt(line.substring(0, 3));
        const message = line.substring(4);

        // Check if this is a complete response (not a multi-line response in progress)
        if (line.charAt(3) === ' ') {
          // 1xx = Preliminary positive reply (command okay, another command expected)
          // 2xx = Positive completion reply
          // 3xx = Positive intermediate reply (command okay, awaiting more info)
          // 4xx/5xx = Negative replies (errors)
          
          if (code >= 100 && code < 200 && allowPreliminary) {
            // Don't remove listener, wait for final response
            this._debug('Preliminary response, waiting for completion...');
            return;
          }

          clearTimeout(timeoutId);
          this.removeListener('response', responseHandler);

          if (code >= 200 && code < 400) {
            resolve({ code, message, raw: line });
          } else {
            this._debug(`Error response: ${code}`);
            reject(new Error(`FTP Error ${code}: ${message}`));
          }
        }
      };

      this.on('response', responseHandler);
      this.socket.write(command + '\r\n');
    });
  }

  /**
   * Enter passive mode and get data connection info
   * @returns {Promise<Object>}
   */
  async _enterPassiveMode() {
    const response = await this._sendCommand('PASV');
    const match = response.message.match(/\((\d+),(\d+),(\d+),(\d+),(\d+),(\d+)\)/);
    
    if (!match) {
      throw new Error('Failed to parse PASV response');
    }

    const host = `${match[1]}.${match[2]}.${match[3]}.${match[4]}`;
    const port = parseInt(match[5]) * 256 + parseInt(match[6]);

    return { host, port };
  }

  /**
   * Upload file to FTP server
   * @param {string|Buffer} data - File data
   * @param {string} remotePath - Remote file path
   * @returns {Promise<void>}
   */
  async upload(data, remotePath) {
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    this._debug(`Uploading ${buffer.length} bytes to ${remotePath}`);
    const { host, port } = await this._enterPassiveMode();

    return new Promise((resolve, reject) => {
      let commandSent = false;

      this.dataSocket = net.createConnection({ host, port }, () => {
        // Send STOR command to start upload (expects 150, then 226)
        if (!commandSent) {
          commandSent = true;
          this._debug(`Data connection established for upload`);
          this._sendCommand(`STOR ${remotePath}`, true).catch(reject);
          
          // Write data to data socket
          this.dataSocket.write(buffer);
          this.dataSocket.end();
        }
      });

      this.dataSocket.on('error', reject);

      this.dataSocket.on('close', () => {
        // Wait for final response from control socket
        const finalHandler = (line) => {
          const code = parseInt(line.substring(0, 3));
          if (code === 226 || code === 250) {
            this.removeListener('response', finalHandler);
            this._debug(`Upload completed successfully`);
            resolve();
          } else if (code >= 400) {
            this.removeListener('response', finalHandler);
            reject(new Error(`FTP Error ${code}: ${line.substring(4)}`));
          }
        };
        this.on('response', finalHandler);
        
        // Timeout if no response
        setTimeout(() => {
          this.removeListener('response', finalHandler);
          resolve();
        }, 5000);
      });
    });
  }

  /**
   * Download file from FTP server
   * @param {string} remotePath - Remote file path
   * @returns {Promise<Buffer>}
   */
  async download(remotePath) {
    this._debug(`Downloading ${remotePath}`);
    const { host, port } = await this._enterPassiveMode();

    return new Promise((resolve, reject) => {
      const chunks = [];
      let commandSent = false;

      this.dataSocket = net.createConnection({ host, port }, () => {
        // Send RETR command to start download (expects 150, then 226)
        if (!commandSent) {
          commandSent = true;
          this._debug(`Data connection established for download`);
          this._sendCommand(`RETR ${remotePath}`, true).catch(reject);
        }
      });

      this.dataSocket.on('data', (chunk) => {
        chunks.push(chunk);
        this._debug(`Received ${chunk.length} bytes`);
      });

      this.dataSocket.on('error', reject);

      this.dataSocket.on('close', () => {
        // Wait for final 226 response
        const finalHandler = (line) => {
          const code = parseInt(line.substring(0, 3));
          if (code === 226 || code === 250) {
            this.removeListener('response', finalHandler);
            const result = Buffer.concat(chunks);
            this._debug(`Download completed: ${result.length} bytes`);
            resolve(result);
          } else if (code >= 400) {
            this.removeListener('response', finalHandler);
            reject(new Error(`FTP Error ${code}: ${line.substring(4)}`));
          }
        };
        this.on('response', finalHandler);
        
        // Timeout if no response
        setTimeout(() => {
          this.removeListener('response', finalHandler);
          if (chunks.length > 0) {
            resolve(Buffer.concat(chunks));
          }
        }, 5000);
      });
    });
  }

  /**
   * List directory contents
   * @param {string} [path='.'] - Directory path
   * @returns {Promise<string>}
   */
  async list(path = '.') {
    this._debug(`Listing directory: ${path}`);
    const { host, port } = await this._enterPassiveMode();

    return new Promise((resolve, reject) => {
      const chunks = [];
      let commandSent = false;

      this.dataSocket = net.createConnection({ host, port }, () => {
        if (!commandSent) {
          commandSent = true;
          this._sendCommand(`LIST ${path}`, true).catch(reject);
        }
      });

      this.dataSocket.on('data', (chunk) => {
        chunks.push(chunk);
      });

      this.dataSocket.on('error', reject);

      this.dataSocket.on('close', () => {
        // Wait for final 226 response
        const finalHandler = (line) => {
          const code = parseInt(line.substring(0, 3));
          if (code === 226 || code === 250) {
            this.removeListener('response', finalHandler);
            resolve(Buffer.concat(chunks).toString('utf8'));
          }
        };
        this.on('response', finalHandler);
        
        // Timeout fallback
        setTimeout(() => {
          this.removeListener('response', finalHandler);
          resolve(Buffer.concat(chunks).toString('utf8'));
        }, 3000);
      });
    });
  }

  /**
   * Change working directory
   * @param {string} path - Directory path
   * @returns {Promise<void>}
   */
  async cd(path) {
    await this._sendCommand(`CWD ${path}`);
  }

  /**
   * Get current working directory
   * @returns {Promise<string>}
   */
  async pwd() {
    const response = await this._sendCommand('PWD');
    const match = response.message.match(/"(.+)"/);
    return match ? match[1] : '/';
  }

  /**
   * Create directory
   * @param {string} path - Directory path
   * @returns {Promise<void>}
   */
  async mkdir(path) {
    await this._sendCommand(`MKD ${path}`);
  }

  /**
   * Delete file
   * @param {string} path - File path
   * @returns {Promise<void>}
   */
  async delete(path) {
    await this._sendCommand(`DELE ${path}`);
  }

  /**
   * Rename file
   * @param {string} from - Current name
   * @param {string} to - New name
   * @returns {Promise<void>}
   */
  async rename(from, to) {
    await this._sendCommand(`RNFR ${from}`);
    await this._sendCommand(`RNTO ${to}`);
  }

  /**
   * Get file size
   * @param {string} path - File path
   * @returns {Promise<number>}
   */
  async size(path) {
    this._debug(`Getting size of ${path}`)
    const response = await this._sendCommand(`SIZE ${path}`);
    return parseInt(response.message);
  }

  /**
   * Check if file or directory exists
   * @param {string} path - File or directory path
   * @returns {Promise<boolean>}
   */
  async exists(path) {
    try {
      await this.size(path);
      return true;
    } catch (err) {
      return false;
    }
  }

  /**
   * Get file modification time
   * @param {string} path - File path
   * @returns {Promise<Date>}
   */
  async modifiedTime(path) {
    this._debug(`Getting modification time of ${path}`);
    const response = await this._sendCommand(`MDTM ${path}`);
    // Parse MDTM response: YYYYMMDDhhmmss
    const match = response.message.match(/(\d{14})/);
    if (match) {
      const str = match[1];
      const year = parseInt(str.substring(0, 4));
      const month = parseInt(str.substring(4, 6)) - 1;
      const day = parseInt(str.substring(6, 8));
      const hour = parseInt(str.substring(8, 10));
      const minute = parseInt(str.substring(10, 12));
      const second = parseInt(str.substring(12, 14));
      return new Date(Date.UTC(year, month, day, hour, minute, second));
    }
    throw new Error('Failed to parse MDTM response');
  }

  /**
   * Get connection statistics
   * @returns {Object}
   */
  getStats() {
    return {
      connected: this.connected,
      authenticated: this.authenticated,
      commandCount: this._commandCount,
      lastCommand: this._lastCommand
    };
  }

  /**
   * Enable or disable debug mode
   * @param {boolean} enabled - Enable debug mode
   */
  setDebug(enabled) {
    this.debug = enabled;
    this._debug(`Debug mode ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Close connection
   * @returns {Promise<void>}
   */
  async close() {
    if (this.connected) {
      this._debug('Closing connection...');
      try {
        await this._sendCommand('QUIT');
      } catch (err) {
        this._debug('Error during QUIT:', err.message);
      }
      this.socket.end();
      this.connected = false;
      this.authenticated = false;
      this._debug('Connection closed');
    }
  }

  /**
   * Disconnect (alias for close)
   * @returns {Promise<void>}
   */
  async disconnect() {
    return this.close();
  }
}

module.exports = FTPClient;
module.exports.FTPClient = FTPClient;
module.exports.default = FTPClient;
