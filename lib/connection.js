const { createOptimizedSocket } = require('./performance');

/**
 * Handle FTP connection establishment and authentication
 */
class FTPConnection {
  constructor(client) {
    this.client = client;
  }

  /**
   * Connect to FTP server and authenticate
   * @param {Object} options - Connection options
   * @param {string} options.host - FTP server host
   * @param {number} [options.port=21] - FTP server port
   * @param {string} [options.user='anonymous'] - Username
   * @param {string} [options.password='anonymous@'] - Password
   * @returns {Promise<void>}
   */
  async connect({ host, port = 21, user = 'anonymous', password = 'anonymous@' }) {
    this.client._debug(`Connecting to ${host}:${port} as ${user}`);
    
    return new Promise((resolve, reject) => {
      this.client.socket = createOptimizedSocket({ host, port }, () => {
        this.client.connected = true;
        this.client._debug('TCP connection established');
        
        this.client.emit('connected');
      });

      this.client.socket.setEncoding('utf8');
      this.client.socket.on('data', async (data) => {
        this.client.buffer += data;
        const lines = this.client.buffer.split('\r\n');
        this.client.buffer = lines.pop();

        for (const line of lines) {
          if (line) {
            this.client._debug('<<<', line);
            this.client.emit('response', line);
            const code = parseInt(line.substring(0, 3));

            // Handle initial connection
            if (code === 220 && !this.client.authenticated) {
              try {
                this.client._debug('Authenticating...');
                await this.sendCommand(`USER ${user}`);
                await this.sendCommand(`PASS ${password}`);
                this.client.authenticated = true;
                this.client._debug('Authentication successful');
                resolve();
              } catch (err) {
                reject(err);
              }
            }
          }
        }
      });

      this.client.socket.on('error', (err) => {
        this.client.emit('error', err);
        reject(err);
      });

      this.client.socket.on('close', () => {
        this.client.connected = false;
        this.client.authenticated = false;
        this.client.emit('close');
      });

      setTimeout(() => reject(new Error('Connection timeout')), this.client.timeout || 10000);
    });
  }

  /**
   * Send FTP command and wait for response
   * @param {string} command - FTP command
   * @param {boolean} allowPreliminary - Allow 1xx preliminary responses
   * @returns {Promise<Object>}
   */
  sendCommand(command, allowPreliminary = false) {
    const { maskPassword } = require('./utils');
    
    return new Promise((resolve, reject) => {
      if (!this.client.connected) {
        return reject(new Error('Not connected'));
      }

      this.client._commandCount++;
      this.client._lastCommand = command;
      const cmdToLog = maskPassword(command);
      this.client._debug('>>>', cmdToLog);

      const timeoutId = setTimeout(() => {
        this.client.removeListener('response', responseHandler);
        reject(new Error(`Command timeout: ${cmdToLog}`));
      }, this.client.timeout);

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
            this.client._debug('Preliminary response, waiting for completion...');
            return;
          }

          clearTimeout(timeoutId);
          this.client.removeListener('response', responseHandler);

          if (code >= 200 && code < 400) {
            resolve({ code, message, raw: line });
          } else {
            this.client._debug(`Error response: ${code}`);
            reject(new Error(`FTP Error ${code}: ${message}`));
          }
        }
      };

      this.client.on('response', responseHandler);
      this.client.socket.write(command + '\r\n');
    });
  }

  /**
   * Enter passive mode and get data connection info
   * @returns {Promise<Object>}
   */
  async enterPassiveMode() {
    const response = await this.sendCommand('PASV');
    const match = response.message.match(/\((\d+),(\d+),(\d+),(\d+),(\d+),(\d+)\)/);
    
    if (!match) {
      throw new Error('Failed to parse PASV response');
    }

    const host = `${match[1]}.${match[2]}.${match[3]}.${match[4]}`;
    const port = parseInt(match[5]) * 256 + parseInt(match[6]);

    return { host, port };
  }

  /**
   * Close connection
   * @returns {Promise<void>}
   */
  async close() {
    if (this.client.connected) {
      this.client._debug('Closing connection...');
      try {
        // Clean up data socket if exists
        if (this.client.dataSocket) {
          this.client.dataSocket.destroy();
          this.client.dataSocket = null;
        }
        await this.sendCommand('QUIT');
      } catch (err) {
        this.client._debug('Error during QUIT:', err.message);
      }
      if (this.client.socket) {
        this.client.socket.end();
      }
      this.client.connected = false;
      this.client.authenticated = false;
      this.client._debug('Connection closed');
    }
  }
}

module.exports = FTPConnection;
