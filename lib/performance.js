/**
 * TCP Performance optimization utilities
 * Applies sensible defaults for FTP connections
 */

const net = require('net');

/**
 * Create an optimized TCP socket connection
 * Automatically applies TCP_NODELAY and keep-alive
 * @param {Object} options - Connection options (host, port)
 * @param {Function} callback - Callback on connection
 * @returns {net.Socket}
 */
function createOptimizedSocket(options, callback) {
  const socket = net.createConnection(options, callback);
  
  // TCP_NODELAY - Disable Nagle's algorithm for lower latency
  socket.setNoDelay(true);
  
  // SO_KEEPALIVE - Detect dead connections
  socket.setKeepAlive(true, 10000);
  
  return socket;
}

module.exports = {
  createOptimizedSocket
};
