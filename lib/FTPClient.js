const { EventEmitter } = require('events');
const FTPConnection = require('./connection');
const FTPCommands = require('./commands');

/**
 * Lightweight FTP Client using native Node.js TCP sockets (net module)
 */
class FTPClient extends EventEmitter
{
  constructor(options = {})
  {
    super();

    // Connection state
    this.socket = null;
    this.dataSocket = null;
    this.buffer = '';
    this.connected = false;
    this.authenticated = false;

    // Configuration
    this.debug = options.debug || false;
    this.timeout = options.timeout || 30000;
    this.keepAlive = options.keepAlive !== false;
    this._log = options.logger || console.log;

    // Statistics
    this._commandCount = 0;
    this._lastCommand = null;

    // Initialize subsystems
    this._connection = new FTPConnection(this);
    this._commands = new FTPCommands(this);
  }

  /**
   * Log message if debug is enabled
   * @private
   */
  _debug(...args)
  {
    if (this.debug && this._log)
    {
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
  async connect(options)
  {
    if (!options || !options.host)
    {
      throw new Error('Connection options with host are required');
    }
    return this._connection.connect(options);
  }

  /**
   * Upload file to FTP server
   * @param {string|Buffer} data - File data
   * @param {string} remotePath - Remote file path
   * @param {boolean} ensureDir - Ensure parent directory exists (default: false)
   * @returns {Promise<void>}
   */
  async upload(data, remotePath, ensureDir = false)
  {
    if (!data)
    {
      throw new Error('Data is required for upload');
    }
    if (!remotePath)
    {
      throw new Error('Remote path is required for upload');
    }
    return this._commands.upload(data, remotePath, ensureDir);
  }

  /**
   * Download file from FTP server
   * @param {string} remotePath - Remote file path
   * @returns {Promise<Buffer>}
   */
  async download(remotePath)
  {
    if (!remotePath)
    {
      throw new Error('Remote path is required for download');
    }
    return this._commands.download(remotePath);
  }

  /**
   * Download file from FTP server as a stream (memory efficient for large files)
   * @param {string} remotePath - Remote file path
   * @param {Stream} writeStream - Writable stream to pipe data to
   * @returns {Promise<number>} - Total bytes transferred
   */
  async downloadStream(remotePath, writeStream)
  {
    if (!remotePath)
    {
      throw new Error('Remote path is required for download');
    }
    if (!writeStream || typeof writeStream.write !== 'function')
    {
      throw new Error('Valid writable stream is required');
    }
    return this._commands.downloadStream(remotePath, writeStream);
  }

  /**
   * List directory contents
   * @param {string} [path='.'] - Directory path
   * @returns {Promise<string>}
   */
  async list(path = '.')
  {
    return this._commands.list(path);
  }

  /**
   * Change working directory
   * @param {string} path - Directory path
   * @returns {Promise<void>}
   */
  async cd(path)
  {
    return this._commands.cd(path);
  }

  /**
   * Get current working directory
   * @returns {Promise<string>}
   */
  async pwd()
  {
    return this._commands.pwd();
  }

  /**
   * Create directory
   * @param {string} path - Directory path
   * @returns {Promise<void>}
   */
  async mkdir(path)
  {
    return this._commands.mkdir(path);
  }

  /**
   * Delete file
   * @param {string} path - File path
   * @returns {Promise<void>}
   */
  async delete(path)
  {
    return this._commands.delete(path);
  }

  /**
   * Rename file
   * @param {string} from - Current name
   * @param {string} to - New name
   * @returns {Promise<void>}
   */
  async rename(from, to)
  {
    return this._commands.rename(from, to);
  }

  /**
   * Get file size
   * @param {string} path - File path
   * @returns {Promise<number>}
   */
  async size(path)
  {
    return this._commands.size(path);
  }

  /**
   * Check if file or directory exists
   * @param {string} path - File or directory path
   * @returns {Promise<boolean>}
   */
  async exists(path)
  {
    return this._commands.exists(path);
  }

  /**
   * Get file/directory information
   * @param {string} path - Path to check
   * @returns {Promise<Object>} - { exists, size, isFile, isDirectory }
   */
  async stat(path)
  {
    return this._commands.stat(path);
  }

  /**
   * Ensure directory exists, creating it if necessary
   * @param {string} dirPath - Directory or file path to ensure exists
   * @param {boolean} recursive - Create parent directories if needed (default: true)
   * @param {boolean} isFilePath - If true, ensures parent directory of file path (default: false)
   * @returns {Promise<void>}
   */
  async ensureDir(dirPath, recursive = true, isFilePath = false)
  {
    return this._commands.ensureDir(dirPath, recursive, isFilePath);
  }

  /**
   * Get file modification time
   * @param {string} path - File path
   * @returns {Promise<Date>}
   */
  async modifiedTime(path)
  {
    return this._commands.modifiedTime(path);
  }

  /**
   * Get connection statistics
   * @returns {Object}
   */
  getStats()
  {
    return {
      connected: this.connected,
      authenticated: this.authenticated,
      commandCount: this._commandCount,
      lastCommand: this._lastCommand
    };
  }

  /**
   * Check if connected and authenticated
   * @returns {boolean}
   */
  isConnected()
  {
    return this.connected && this.authenticated;
  }

  /**
   * Enable or disable debug mode
   * @param {boolean} enabled - Enable debug mode
   */
  setDebug(enabled)
  {
    this.debug = enabled;
    this._debug(`Debug mode ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Change file permissions (Unix/Linux servers only)
   * @param {string} path - File or directory path
   * @param {string|number} mode - Permissions (e.g., '755', 0755)
   * @returns {Promise<void>}
   */
  async chmod(path, mode)
  {
    return this._commands.chmod(path, mode);
  }

  /**
   * Execute a SITE command (server-specific commands)
   * @param {string} command - SITE command to execute
   * @returns {Promise<Object>}
   */
  async site(command)
  {
    return this._commands.site(command);
  }

  /**
   * Get detailed directory listing with permissions, owner, size, etc.
   * @param {string} path - Directory path
   * @returns {Promise<Array>}
   */
  async listDetailed(path = '.')
  {
    return this._commands.listDetailed(path);
  }

  /**
   * Close connection
   * @returns {Promise<void>}
   */
  async close()
  {
    return this._connection.close();
  }

  /**
   * Disconnect (alias for close)
   * @returns {Promise<void>}
   */
  async disconnect()
  {
    return this.close();
  }
}

module.exports = FTPClient;
