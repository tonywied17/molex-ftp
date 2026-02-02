# molex-ftp-client

Lightweight FTP client built with native Node.js TCP sockets (net module).

## Features

- ✅ **Zero dependencies** - Uses only native Node.js modules
- ✅ **Promise-based API** - Modern async/await support
- ✅ **Passive mode** (PASV) for data transfers
- ✅ **Debug logging** - Optional verbose logging for troubleshooting
- ✅ **Connection keep-alive** - Automatic TCP keep-alive
- ✅ **Configurable timeouts** - Prevent hanging connections
- ✅ **Event-based** - Listen to FTP responses and events
- ✅ **Upload/download** files with Buffer support
- ✅ **Directory operations** (list, cd, mkdir, pwd)
- ✅ **File operations** (delete, rename, size, exists, modifiedTime)
- ✅ **Connection statistics** - Track command count and status

## Installation

```bash
npm install molex-ftp-client
```

## Quick Start

```javascript
const FTPClient = require('molex-ftp-client');

const client = new FTPClient({
  debug: true,           // Enable debug logging (default: false)
  timeout: 30000,        // Command timeout in ms (default: 30000)
  keepAlive: true        // Enable TCP keep-alive (default: true)
});

try {
  // Connect to FTP server
  await client.connect({
    host: 'ftp.example.com',
    port: 21,
    user: 'username',
    password: 'password'
  });

  // Upload file
  await client.upload('Hello World!', '/remote/path/file.txt');

  // Download file
  const data = await client.download('/remote/path/file.txt');
  console.log(data.toString());

  // Close connection
  await client.close();
} catch (err) {
  console.error('FTP Error:', err);
}
```

## Constructor Options

```javascript
const client = new FTPClient({
  debug: false,          // Enable debug logging
  timeout: 30000,        // Command timeout in milliseconds
  keepAlive: true,       // Enable TCP keep-alive
  logger: console.log    // Custom logger function
});
```

## API

### Connection

#### `connect(options)`

Connect to FTP server.

```javascript
await client.connect({
  host: 'ftp.example.com',  // Required
  port: 21,                  // Default: 21
  user: 'username',          // Default: 'anonymous'
  password: 'password'       // Default: 'anonymous@'
});
```

Returns: `Promise<void>`

#### `close()` / `disconnect()`

Close connection to FTP server.

```javascript
await client.close();
```

Returns: `Promise<void>`

### File Operations

#### `upload(data, remotePath)`

Upload file to server.

```javascript
// Upload string
await client.upload('Hello World!', '/path/file.txt');

// Upload Buffer
const buffer = Buffer.from('data');
await client.upload(buffer, '/path/file.bin');
```

Returns: `Promise<void>`

#### `download(remotePath)`

Download file from server.

```javascript
const data = await client.download('/path/file.txt');
console.log(data.toString()); // Convert Buffer to string
```

Returns: `Promise<Buffer>`

#### `delete(path)`

Delete file.

```javascript
await client.delete('/path/file.txt');
```

Returns: `Promise<void>`

#### `rename(from, to)`

Rename or move file.

```javascript
await client.rename('/old/path.txt', '/new/path.txt');
```

Returns: `Promise<void>`

#### `size(path)`

Get file size in bytes.

```javascript
const bytes = await client.size('/path/file.txt');
console.log(`File size: ${bytes} bytes`);
```

Returns: `Promise<number>`

#### `exists(path)`

Check if file exists.

```javascript
const exists = await client.exists('/path/file.txt');
console.log(exists ? 'File exists' : 'File not found');
```

Returns: `Promise<boolean>`

#### `modifiedTime(path)`

Get file modification time.

```javascript
const date = await client.modifiedTime('/path/file.txt');
console.log(`Last modified: ${date.toISOString()}`);
```

Returns: `Promise<Date>`

### Directory Operations

#### `list(path)`

List directory contents.

```javascript
const listing = await client.list('/remote/path');
console.log(listing);
```

Returns: `Promise<string>` - Raw directory listing

#### `cd(path)`

Change working directory.

```javascript
await client.cd('/remote/path');
```

Returns: `Promise<void>`

#### `pwd()`

Get current working directory.

```javascript
const dir = await client.pwd();
console.log(`Current directory: ${dir}`);
```

Returns: `Promise<string>`

#### `mkdir(path)`

Create directory.

```javascript
await client.mkdir('/remote/newdir');
```

Returns: `Promise<void>`

### Utilities

#### `getStats()`

Get connection statistics.

```javascript
const stats = client.getStats();
console.log(stats);
// {
//   connected: true,
//   authenticated: true,
//   commandCount: 5,
//   lastCommand: 'LIST .'
// }
```

Returns: `Object`

#### `setDebug(enabled)`

Enable or disable debug mode at runtime.

```javascript
client.setDebug(true);  // Enable debug logging
client.setDebug(false); // Disable debug logging
```

## Events

The client extends EventEmitter and emits the following events:

### `connected`

Fired when TCP connection is established.

```javascript
client.on('connected', () => {
  console.log('Connected to FTP server');
});
```

### `response`

Fired for each FTP response (useful for debugging).

```javascript
client.on('response', (line) => {
  console.log('FTP:', line);
});
```

### `error`

Fired on connection errors.

```javascript
client.on('error', (err) => {
  console.error('FTP Error:', err);
});
```

### `close`

Fired when connection is closed.

```javascript
client.on('close', () => {
  console.log('Connection closed');
});
```

## Debug Mode

Enable debug logging to troubleshoot FTP issues:

```javascript
const client = new FTPClient({ debug: true });

client.on('response', (line) => {
  console.log('FTP Response:', line);
});

await client.connect({ host: 'ftp.example.com', user: 'user', password: 'pass' });
// [FTP Debug] Connecting to ftp.example.com:21 as user
// [FTP Debug] TCP connection established
// [FTP Debug] <<< 220 Welcome to FTP server
// [FTP Debug] >>> USER user
// [FTP Debug] <<< 331 Password required
// [FTP Debug] >>> PASS ********
// [FTP Debug] <<< 230 Login successful
// [FTP Debug] Authentication successful
```

## Error Handling

All methods return promises and will reject on errors:

```javascript
try {
  await client.upload('data', '/readonly/file.txt');
} catch (err) {
  if (err.message.includes('FTP Error 550')) {
    console.error('Permission denied');
  } else {
    console.error('Upload failed:', err.message);
  }
}
```

## Complete Example

```javascript
const FTPClient = require('molex-ftp-client');

async function backupFile() {
  const client = new FTPClient({ 
    debug: true,
    timeout: 60000 
  });

  try {
    // Connect
    await client.connect({
      host: 'ftp.myserver.com',
      port: 21,
      user: 'admin',
      password: 'secret123'
    });

    console.log('Current directory:', await client.pwd());

    // Check if file exists
    const exists = await client.exists('/backup/data.json');
    if (exists) {
      // Download existing file
      const oldData = await client.download('/backup/data.json');
      console.log('Old backup size:', oldData.length, 'bytes');
      
      // Get modification time
      const modTime = await client.modifiedTime('/backup/data.json');
      console.log('Last modified:', modTime.toISOString());
      
      // Rename old backup
      await client.rename('/backup/data.json', '/backup/data.old.json');
    }

    // Upload new backup
    const newData = JSON.stringify({ timestamp: Date.now(), data: [1, 2, 3] });
    await client.upload(newData, '/backup/data.json');
    console.log('Backup uploaded successfully');

    // Verify
    const size = await client.size('/backup/data.json');
    console.log('New backup size:', size, 'bytes');

    // Get stats
    const stats = client.getStats();
    console.log('Commands executed:', stats.commandCount);

    // Close connection
    await client.close();
  } catch (err) {
    console.error('Backup failed:', err.message);
    await client.close();
  }
}

backupFile();
```

## License

ISC © Tony Wiedman / MolexWorks

