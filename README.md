# molex-ftp-client

Lightweight FTP client built with native Node.js TCP sockets. Zero dependencies, optimized for performance.

## Features

- **Zero dependencies** - Uses only native Node.js modules
- **Promise-based API** - Modern async/await support
- **TCP optimizations** - TCP_NODELAY and keep-alive applied by default
- **Auto-create directories** - Upload files to nested paths automatically
- **Streaming support** - Memory-efficient downloads for large files
- **Full FTP support** - Upload, download, list, delete, rename, stat, and more

## Installation

```bash
npm install molex-ftp-client
```

## Quick Start

```javascript
const FTPClient = require('molex-ftp-client');

const client = new FTPClient();

await client.connect({
  host: 'ftp.example.com',
  user: 'username',
  password: 'password'
});

// Upload with auto-directory creation
await client.upload('Hello World!', '/path/to/file.txt', true);

// Download
const data = await client.download('/path/to/file.txt');
console.log(data.toString());

await client.close();
```

## Constructor Options

```javascript
const client = new FTPClient({
  debug: false,       // Enable debug logging
  timeout: 30000,     // Command timeout in milliseconds (default: 30000)
  logger: console.log // Custom logger function
});
```

## API Reference

### Connection Methods

#### `connect(options)`
```javascript
await client.connect({
  host: 'ftp.example.com',    // Required
  port: 21,                    // Default: 21
  user: 'username',            // Default: 'anonymous'
  password: 'password'         // Default: 'anonymous@'
});
```

#### `close()`
```javascript
await client.close();
```

### File Methods

#### `upload(data, remotePath, ensureDir)`
```javascript
await client.upload('content', '/path/file.txt');           // Basic upload
await client.upload(buffer, '/path/file.bin');              // Upload Buffer
await client.upload('content', '/deep/path/file.txt', true); // Auto-create dirs
```

#### `download(remotePath)` → `Buffer`
```javascript
const data = await client.download('/path/file.txt');
```

#### `downloadStream(remotePath, writeStream)` → `number`
Stream download directly to a writable stream (for saving to disk or processing chunks).
```javascript
const fs = require('fs');
const fileStream = fs.createWriteStream('./local-file.bin');
const bytes = await client.downloadStream('/remote.bin', fileStream);
console.log(`Saved ${bytes} bytes to disk`);
```

#### `delete(path)`
```javascript
await client.delete('/path/file.txt');
```

#### `rename(from, to)`
```javascript
await client.rename('/old.txt', '/new.txt');
```

#### `exists(path)` → `boolean`
```javascript
const exists = await client.exists('/path/file.txt');
```

#### `stat(path)` → `Object`
Get detailed file/directory information.
```javascript
const info = await client.stat('/path/file.txt');
// { exists: true, size: 1024, isFile: true, isDirectory: false }
```

#### `size(path)` → `number`
```javascript
const bytes = await client.size('/path/file.txt');
```

### Directory Methods

#### `list(path)` → `string`
```javascript
const listing = await client.list('/path');
```

#### `mkdir(path)`
```javascript
await client.mkdir('/path/newdir');
```

#### `cd(path)`
```javascript
await client.cd('/path/to/directory');
```

#### `pwd()` → `string`
```javascript
const currentDir = await client.pwd();
```

#### `ensureDir(dirPath, recursive, isFilePath)`
Create directory if it doesn't exist, optionally creating parent directories.
```javascript
await client.ensureDir('/deep/nested/path');              // Create full path
await client.ensureDir('/path/file.txt', true, true);     // Ensure parent dir for file
```

### Utility Methods

#### `getState()` → `Object`
Get current client state for debugging.
```javascript
const state = client.getState();
// {
//   connected: true,
//   authenticated: true,
//   host: 'ftp.example.com',
//   ...
// }
```

#### `setDebug(enabled)`
Toggle debug mode at runtime.
```javascript
client.setDebug(true);
```

## Events

```javascript
client.on('connected', () => console.log('TCP connection established'));
client.on('response', (line) => console.log('FTP:', line));
client.on('error', (err) => console.error('Error:', err));
client.on('close', () => console.log('Connection closed'));
```

## Debugging

Enable debug mode to see all FTP commands and responses:

```javascript
const client = new FTPClient({ debug: true });

await client.connect({ host: 'ftp.example.com', user: 'user', password: 'pass' });
// [FTP Debug] Connecting to ftp.example.com:21 as user
// [FTP Debug] TCP connection established
// [FTP Debug] <<< 220 Welcome to FTP server
// [FTP Debug] >>> USER user
// [FTP Debug] <<< 331 Password required
// [FTP Debug] >>> PASS ********
// [FTP Debug] <<< 230 Login successful
```

## Performance

TCP optimizations are automatically applied:
- **TCP_NODELAY** - Disables Nagle's algorithm for lower latency
- **Keep-alive** - Detects dead connections (10s interval)

For large files, use `downloadStream()` to save directly to disk without buffering in memory:

```javascript
const fs = require('fs');
const fileStream = fs.createWriteStream('./large-backup.zip');
const bytes = await client.downloadStream('/backup.zip', fileStream);
console.log(`Saved ${bytes} bytes to disk`);
```

## Error Handling

```javascript
try {
  await client.upload('data', '/readonly/file.txt');
} catch (err) {
  if (err.message.includes('FTP Error 550')) {
    console.error('Permission denied');
  }
}
```

## Example

```javascript
const FTPClient = require('molex-ftp-client');

async function main() {
  const client = new FTPClient({ debug: true });

  try {
    await client.connect({
      host: 'ftp.example.com',
      user: 'admin',
      password: 'secret'
    });

    // Check file info
    const info = await client.stat('/backup/data.json');
    if (info.exists) {
      console.log(`File size: ${info.size} bytes`);
      const data = await client.download('/backup/data.json');
      console.log('Downloaded:', data.toString());
    }

    // Upload new file
    await client.upload('new data', '/backup/updated.json', true);
    
    await client.close();
  } catch (err) {
    console.error('FTP Error:', err.message);
  }
}

main();
```

## License

ISC License