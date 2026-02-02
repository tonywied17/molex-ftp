/**
 * Performance benchmark for FTP client
 * Compare different performance presets
 */

const FTPClient = require('./index.js');

async function benchmark() {
  const testData = 'x'.repeat(50000); // 50KB test data
  const presets = ['DEFAULT', 'LOW_LATENCY', 'HIGH_THROUGHPUT', 'BALANCED'];
  
  console.log('\n=== FTP Client Performance Benchmark ===\n');
  console.log('Test data size:', testData.length, 'bytes\n');

  for (const preset of presets) {
    console.log(`Testing ${preset} preset...`);
    
    const client = new FTPClient({
      debug: false,
      timeout: 60000,
      performancePreset: preset
    });

    try {
      // Connect
      const connectStart = Date.now();
      await client.connect({
        host: 'ftp.example.com',
        port: 21,
        user: 'username',
        password: 'password'
      });
      const connectTime = Date.now() - connectStart;

      // Upload
      const uploadStart = Date.now();
      await client.upload(testData, '/benchmark-test.txt', true);
      const uploadTime = Date.now() - uploadStart;

      // Download
      const downloadStart = Date.now();
      const data = await client.download('/benchmark-test.txt');
      const downloadTime = Date.now() - downloadStart;

      // Cleanup
      await client.delete('/benchmark-test.txt');
      await client.close();

      console.log(`  Connect:  ${connectTime}ms`);
      console.log(`  Upload:   ${uploadTime}ms`);
      console.log(`  Download: ${downloadTime}ms`);
      console.log(`  Total:    ${connectTime + uploadTime + downloadTime}ms`);
      console.log('');

    } catch (err) {
      console.error(`  Error: ${err.message}\n`);
      await client.close();
    }

    // Wait between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('=== Benchmark Complete ===\n');
  console.log('Recommendation:');
  console.log('  - Use LOW_LATENCY for small files (< 1MB)');
  console.log('  - Use HIGH_THROUGHPUT for large files (> 10MB)');
  console.log('  - Use BALANCED for mixed workloads\n');
}

// Only run if called directly
if (require.main === module) {
  console.log('\n⚠️  Update the benchmark() function with your FTP credentials to test.\n');
  console.log('Example:');
  console.log('  await client.connect({');
  console.log('    host: "ftp.example.com",');
  console.log('    port: 21,');
  console.log('    user: "username",');
  console.log('    password: "password"');
  console.log('  });\n');
  
  // Uncomment to run benchmark:
  // benchmark();
}

module.exports = benchmark;
