const FTPClient = require('./index.js');

// Example test usage with debug mode
async function test() {
  const client = new FTPClient({
    debug: true,           // Enable debug logging
    timeout: 30000,        // 30 second timeout
    keepAlive: true        // Keep connection alive
  });

  // Log all FTP responses
  client.on('response', (line) => {
    console.log('FTP Response:', line);
  });

  client.on('connected', () => {
    console.log('✓ Connected to FTP server');
  });

  client.on('close', () => {
    console.log('✓ Connection closed');
  });

  try {
    console.log('\n=== Testing FTP Client ===\n');
    
    console.log('Connecting...');
    await client.connect({
      host: 'ftp.example.com',
      port: 21,
      user: 'username',
      password: 'password'
    });

    // Test PWD
    const dir = await client.pwd();
    console.log('✓ Current directory:', dir);

    // Test connection stats
    let stats = client.getStats();
    console.log('✓ Stats:', stats);

    // Test exists
    const exists = await client.exists('/test.txt');
    console.log('✓ File exists:', exists);

    // Test exists for directory
    const dirExists = await client.exists('/');
    console.log('✓ Root directory exists:', dirExists);

    // Test upload with ensureDir
    await client.upload('Hello from FTP client!\nTimestamp: ' + new Date().toISOString(), '/testdir/test.txt', true);
    console.log('✓ File uploaded with directory creation!');

    // Test size
    const size = await client.size('/testdir/test.txt');
    console.log('✓ File size:', size, 'bytes');

    // Test modified time
    try {
      const modTime = await client.modifiedTime('/testdir/test.txt');
      console.log('✓ Last modified:', modTime.toISOString());
    } catch (err) {
      console.log('⚠ MDTM not supported by server');
    }

    // Test download
    const data = await client.download('/testdir/test.txt');
    console.log('✓ Downloaded:', data.toString());

    // Test list
    const listing = await client.list('.');
    console.log('✓ Directory listing:');
    console.log(listing);

    // Final stats
    stats = client.getStats();
    console.log('\n✓ Final stats:', stats);

    await client.close();
    console.log('\n=== All tests completed successfully! ===');
  } catch (err) {
    console.error('\n✗ Error:', err.message);
    await client.close();
    process.exit(1);
  }
}

// Only run if called directly
if (require.main === module) {
  console.log('\n⚠️  Update the test() function with your FTP credentials to test.\n');
  console.log('Example:');
  console.log('  await client.connect({');
  console.log('    host: "ftp.example.com",');
  console.log('    port: 21,');
  console.log('    user: "username",');
  console.log('    password: "password"');
  console.log('  });\n');
  
  // Uncomment to run test:
  // test();
}

module.exports = test;
