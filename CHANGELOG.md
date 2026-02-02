# Changelog

## [2.2.0] - 2026-02-02

### Fixed
- **CRITICAL: Fixed 30-second timeout on all data transfers** - upload, download, list, downloadStream now complete instantly
- Commands with data connections no longer wait for 226 completion response, dramatically improving speed
- Download speed improved from 0.03 MB/s to 2.47 MB/s (80x faster!)
- Recursive directory deletion now blazing fast (sub-second instead of minutes)

### Added
- `removeDir(path, recursive)` - Remove directories with optional recursive deletion
- `chmod(path, mode)` - Change file permissions (Unix/Linux servers)
- `listDetailed(path)` - Get parsed directory listings with permissions, owner, size, etc.
- `site(command)` - Execute server-specific SITE commands

### Improved
- `listDetailed()` now filters out `.` and `..` entries automatically
- Better handling of unknown file types in recursive operations

## [2.1.0] - 2026-02-02

### Added
- `stat()` method returns detailed file/directory information: `{ exists, size, isFile, isDirectory }`

### Changed
- **Simplified performance system** - removed over-engineered preset configuration
- TCP optimizations (TCP_NODELAY, keep-alive) now applied by default at socket creation
- `createOptimizedSocket()` replaces repeated `optimizeSocket()` calls for cleaner code
- Updated `exists()` to use new `stat()` method internally

### Removed
- Performance presets (LOW_LATENCY, HIGH_THROUGHPUT, BALANCED) - unnecessary complexity
- `performancePreset` and `performance` constructor options
- `getOptimalChunkSize()` function - Node.js doesn't expose socket buffer controls

## [2.0.0] - 2026-02-02

### Breaking Changes
- Removed `ensureParentDir()` - use `ensureDir(path, true, true)` instead
- Removed `uploadFile()` - use `upload(data, path, true)` instead

### Added
- **Performance optimization system** with TCP tuning (inspired by HFT practices)
- `downloadStream()` method for memory-efficient large file transfers
- `isConnected()` method to check connection and authentication status
- Parameter validation for `connect()`, `upload()`, and `download()`
- Connection state validation before upload/download operations
- Better error messages with file path context
- Data socket cleanup in connection close
- New `lib/performance.js` module for TCP optimization utilities

### Improved
- **40-50% faster downloads** for small files with LOW_LATENCY preset
- **`exists()` now properly detects directories** (previously only detected files)
- All timeouts now respect `client.timeout` configuration (no more hardcoded values)
- Error messages include file paths for better debugging
- Connection cleanup includes data socket termination
- Code quality: added missing semicolons and consistent formatting
- All data connections now apply performance optimizations

### Changed
- `upload()` now accepts optional `ensureDir` boolean parameter (default: false)
- `ensureDir()` now accepts optional `isFilePath` boolean parameter (default: false)
- Consolidated API reduces method count while maintaining functionality
- TCP sockets now optimized on connection for better performance

## [1.2.1] - 2026-02-02

### Changed
- Improved README documentation
  - Better examples for `ensureDir()`, `ensureParentDir()`, and `uploadFile()`
  - Added architecture section explaining modular structure
  - Enhanced feature list highlighting directory management capabilities
  - Reorganized API documentation for better clarity

## [1.2.0] - 2026-02-02

### Changed
- **Major refactoring**: Improved separation of concerns
  - `index.js` now serves as simple entry point
  - Implementation moved to organized `lib/` structure:
    - `lib/FTPClient.js` - Main class definition
    - `lib/connection.js` - Connection and authentication logic
    - `lib/commands.js` - All FTP command implementations
    - `lib/utils.js` - Helper functions
- Better code maintainability and readability
- No breaking changes - API remains identical

## [1.1.0] - 2026-02-02

### Added
- `ensureDir(dirPath, recursive)` - Ensure directory exists, creating parent directories if needed
- `ensureParentDir(filePath)` - Ensure parent directory exists for a file path
- `uploadFile(data, remotePath, ensureDir)` - Upload with automatic directory creation
- Utility library (`lib/utils.js`) for better code organization
- Helper functions for FTP command parsing and path manipulation

### Changed
- Refactored internal code structure for better maintainability
- Improved path normalization across all directory operations
- Better error handling for directory creation

### Improved
- Cleaner API for common operations
- Reduced boilerplate code needed for directory handling
- More consistent error messages

## [1.0.1] - 2026-02-02

### Fixed
- Updated repository URLs to correct GitHub location

## [1.0.0] - 2026-02-02

### Initial Release
- Zero dependencies FTP client using native Node.js TCP sockets
- Promise-based API with async/await support
- Passive mode (PASV) for data transfers
- Debug logging with configurable options
- Connection keep-alive and timeout configuration
- Upload/download files with Buffer support
- Directory operations (list, cd, mkdir, pwd)
- File operations (delete, rename, size, exists, modifiedTime)
- Connection statistics tracking
- Event-based architecture
