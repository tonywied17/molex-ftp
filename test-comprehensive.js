const FTPClient = require('./index.js');

// Test configuration
const CONFIG = {
  host: '',
  port: 21,
  user: '',
  password: ''
};

const TEST_DIR = '/molex-ftp-testing';

// Test runner
async function runTests() {
  const client = new FTPClient({ 
    debug: true,
    timeout: 30000
  });

  console.log('\n🧪 Starting FTP Client Comprehensive Test Suite\n');
  console.log('=' .repeat(60));

  try {
    // Test 1: Connect
    console.log('\n✅ TEST 1: Connect to FTP server');
    await client.connect(CONFIG);
    console.log(`   Connected to ${CONFIG.host}:${CONFIG.port}`);

    // Test 2: Get current directory
    console.log('\n✅ TEST 2: Get current working directory');
    const currentDir = await client.pwd();
    console.log(`   Current directory: ${currentDir}`);

    // Test 3: Create test directory
    console.log(`\n✅ TEST 3: Create test directory ${TEST_DIR}`);
    try {
      await client.mkdir(TEST_DIR);
      console.log(`   Created ${TEST_DIR}`);
    } catch (err) {
      console.log(`   Directory already exists or error: ${err.message}`);
    }

    // Test 4: Change to test directory
    console.log(`\n✅ TEST 4: Change to test directory`);
    await client.cd(TEST_DIR);
    const newDir = await client.pwd();
    console.log(`   Changed to: ${newDir}`);

    // Test 5: Upload a text file
    console.log('\n✅ TEST 5: Upload text file');
    const testContent = 'Hello from molex-ftp!\nTimestamp: ' + new Date().toISOString();
    await client.upload(testContent, 'test-file.txt');
    console.log('   Uploaded test-file.txt');

    // Test 6: Upload with auto-directory creation
    console.log('\n✅ TEST 6: Upload with auto-directory creation');
    await client.upload('Nested file content', 'subdir/nested/deep.txt', true);
    console.log('   Uploaded subdir/nested/deep.txt (created directories)');

    // Test 7: Check if file exists
    console.log('\n✅ TEST 7: Check if file exists');
    const exists = await client.exists('test-file.txt');
    console.log(`   test-file.txt exists: ${exists}`);

    // Test 8: Get file stats
    console.log('\n✅ TEST 8: Get file statistics');
    const stat = await client.stat('test-file.txt');
    console.log(`   Stats:`, stat);

    // Test 9: Get file size
    console.log('\n✅ TEST 9: Get file size');
    const size = await client.size('test-file.txt');
    console.log(`   Size: ${size} bytes`);

    // Test 10: Download file
    console.log('\n✅ TEST 10: Download file');
    const downloaded = await client.download('test-file.txt');
    console.log(`   Downloaded ${downloaded.length} bytes`);
    console.log(`   Content: ${downloaded.toString().substring(0, 50)}...`);

    // Test 11: List directory
    console.log('\n✅ TEST 11: List directory (raw)');
    const listing = await client.list('.');
    console.log(`   Listing:\n${listing.split('\n').slice(0, 5).join('\n')}`);

    // Test 12: List directory detailed
    console.log('\n✅ TEST 12: List directory (detailed)');
    const detailedListing = await client.listDetailed('.');
    console.log(`   Found ${detailedListing.length} items:`);
    detailedListing.forEach(item => {
      console.log(`   - ${item.type === 'directory' ? '📁' : '📄'} ${item.name} (${item.permissions || 'N/A'})`);
    });

    // Test 13: Rename file
    console.log('\n✅ TEST 13: Rename file');
    await client.rename('test-file.txt', 'renamed-file.txt');
    console.log('   Renamed test-file.txt → renamed-file.txt');

    // Test 14: Get modified time
    console.log('\n✅ TEST 14: Get file modification time');
    try {
      const modTime = await client.modifiedTime('renamed-file.txt');
      console.log(`   Modified: ${modTime}`);
    } catch (err) {
      console.log(`   Not supported or error: ${err.message}`);
    }

    // Test 15: Create multiple directories
    console.log('\n✅ TEST 15: Create nested directories and test ensureDir');
    await client.mkdir('test-dir-1');
    await client.mkdir('test-dir-2');
    await client.ensureDir('deep/nested/structure');
    console.log('   Created test-dir-1, test-dir-2, and deep/nested/structure');
    
    // Test ensureDir with file path (auto-detection)
    await client.ensureDir('auto/detect/file.txt');
    console.log('   ensureDir auto-detected file.txt and created parent dirs: auto/detect/');
    
    // Verify by uploading to the auto-created directory
    await client.upload('Auto-created dirs work!', 'auto/detect/file.txt');
    console.log('   Uploaded file to auto-created directory structure');

    // Test 16: Upload file with Buffer
    console.log('\n✅ TEST 16: Upload file using Buffer');
    const buffer = Buffer.from('Binary content test', 'utf8');
    await client.upload(buffer, 'test-dir-1/buffer-test.bin');
    console.log('   Uploaded buffer-test.bin to test-dir-1');

    // Test 17: Download with stream
    console.log('\n✅ TEST 17: Download using stream');
    const { PassThrough } = require('stream');
    const stream = new PassThrough();
    const chunks = [];
    stream.on('data', chunk => chunks.push(chunk));
    const bytes = await client.downloadStream('renamed-file.txt', stream);
    console.log(`   Downloaded ${bytes} bytes via stream`);

    // Test 17a: Upload local file
    console.log('\n✅ TEST 17a: Upload local file from disk');
    const fs = require('fs');
    const localTestFile = './test-local-upload.txt';
    fs.writeFileSync(localTestFile, 'Local file content test\nTimestamp: ' + new Date().toISOString());
    await client.uploadFile(localTestFile, 'uploaded-from-disk.txt');
    console.log(`   Uploaded ${localTestFile} → uploaded-from-disk.txt`);
    fs.unlinkSync(localTestFile);
    console.log(`   Cleaned up local file`);

    // Test 17b: Download to local file
    console.log('\n✅ TEST 17b: Download to local file on disk');
    const localDownloadFile = './test-local-download.txt';
    const downloadBytes = await client.downloadFile('uploaded-from-disk.txt', localDownloadFile);
    const downloadedContent = fs.readFileSync(localDownloadFile, 'utf8');
    console.log(`   Downloaded ${downloadBytes} bytes to ${localDownloadFile}`);
    console.log(`   Content preview: ${downloadedContent.substring(0, 50)}...`);
    fs.unlinkSync(localDownloadFile);
    console.log(`   Cleaned up local file`);
    await client.delete('uploaded-from-disk.txt');
    console.log(`   Cleaned up remote file`);

    // Test 17c: Large file upload/download performance test
    console.log('\n✅ TEST 17c: Large file performance test');
    const largeData = Buffer.alloc(1024 * 1024, 'x'); // 1MB file
    console.log(`   Uploading 1MB file...`);
    const uploadStart = Date.now();
    await client.upload(largeData, 'large-test.bin');
    const uploadTime = Date.now() - uploadStart;
    console.log(`   Upload: ${(largeData.length / uploadTime / 1024).toFixed(2)} MB/s (${uploadTime}ms)`);
    
    console.log(`   Downloading 1MB file...`);
    const downloadStart = Date.now();
    const largeDownload = await client.download('large-test.bin');
    const downloadTime = Date.now() - downloadStart;
    console.log(`   Download: ${(largeDownload.length / downloadTime / 1024).toFixed(2)} MB/s (${downloadTime}ms)`);
    
    await client.delete('large-test.bin');
    console.log(`   Cleaned up large-test.bin`);

    // Test 18: Try chmod
    console.log('\n✅ TEST 18: Change file permissions (chmod)');
    try {
      await client.chmod('renamed-file.txt', '644');
      console.log('   Changed permissions to 644');
    } catch (err) {
      console.log(`   Not supported or error: ${err.message}`);
    }

    // Test 19: Execute SITE command
    console.log('\n✅ TEST 19: Execute SITE command');
    try {
      const response = await client.site('HELP');
      console.log(`   SITE HELP response: ${response.message.substring(0, 50)}...`);
    } catch (err) {
      console.log(`   Not supported or error: ${err.message}`);
    }

    // Test 20: Check connection state
    console.log('\n✅ TEST 20: Get client state');
    const state = client.getStats();
    console.log(`   Connected: ${state.connected}, Authenticated: ${state.authenticated}`);
    console.log(`   Commands executed: ${state.commandCount}`);

    // Test 21: Delete single file
    console.log('\n✅ TEST 21: Delete single file');
    await client.delete('test-dir-1/buffer-test.bin');
    console.log('   Deleted buffer-test.bin');

    // Test 22: Remove empty directory
    console.log('\n✅ TEST 22: Remove empty directory');
    await client.removeDir('test-dir-1');
    console.log('   Removed test-dir-1');

    // Test 23: Remove directory recursively
    console.log('\n✅ TEST 23: Remove directory recursively');
    await client.removeDir('subdir', true);
    console.log('   Recursively removed subdir and all contents');

    // Test 24: Final directory listing
    console.log('\n✅ TEST 24: Final directory listing');
    const finalListing = await client.listDetailed('.');
    console.log(`   Items remaining: ${finalListing.length}`);

    // Cleanup: Remove test directory
    console.log('\n🧹 CLEANUP: Removing test directory');
    await client.cd('..');
    await client.removeDir(TEST_DIR, true);
    console.log(`   Removed ${TEST_DIR} and all contents`);

    // Close connection
    console.log('\n✅ Closing connection');
    await client.close();
    console.log('   Connection closed');

    console.log('\n' + '='.repeat(60));
    console.log('🎉 ALL TESTS PASSED!');
    console.log('='.repeat(60) + '\n');

  } catch (err) {
    console.error('\n❌ TEST FAILED:', err.message);
    console.error('Stack:', err.stack);
    
    // Try to cleanup and close
    try {
      console.log('\n🧹 Attempting cleanup...');
      await client.cd('/');
      try {
        await client.removeDir(TEST_DIR, true);
        console.log('   Cleaned up test directory');
      } catch (e) {
        console.log('   Could not clean up:', e.message);
      }
      await client.close();
    } catch (e) {
      console.log('   Could not close connection:', e.message);
    }
    
    process.exit(1);
  }
}

// Run the tests
console.log('Starting comprehensive FTP client tests...');
runTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
