/**
 * Test Database Check Functionality
 * =================================
 *
 * This script demonstrates how the seeding application checks the database
 * for existing records and uses those counts as skip values to avoid
 * duplicating data.
 */

const {
  calculateResumePositions,
  getExistingRecordCounts,
} = require('../src/utils/resume-calculator')
const { testConnection, disconnect } = require('../src/utils/database')
const logger = require('../src/utils/logger')

async function testDatabaseCheck() {
  console.log('🧪 Testing Database Check Functionality')
  console.log('='.repeat(50))

  try {
    // Test database connection
    console.log('\n🔌 Testing database connection...')
    const connected = await testConnection()
    if (!connected) {
      throw new Error('Database connection failed')
    }
    console.log('✅ Database connection successful')

    // Get existing record counts
    console.log('\n🔢 Counting existing records in each table...')
    const counts = await getExistingRecordCounts()

    console.log('\n📊 Current Database Record Counts:')
    console.log(`   Program Areas: ${counts.programAreas.toLocaleString()}`)
    console.log(`   Programs: ${counts.programs.toLocaleString()}`)
    console.log(`   NOC Unit Groups: ${counts.nocUnitGroups.toLocaleString()}`)
    console.log(`   NOC Sections: ${counts.nocSections.toLocaleString()}`)
    console.log(
      `   Economic Regions: ${counts.economicRegions.toLocaleString()}`
    )
    console.log(`   Outlooks: ${counts.outlooks.toLocaleString()}`)
    console.log(
      `   Program-NOC Links: ${counts.programNocLinks.toLocaleString()}`
    )

    // Calculate skip values
    console.log('\n📍 Calculating skip values based on existing records...')
    const resumeConfig = await calculateResumePositions()

    console.log('\n🎯 Skip Values (to avoid duplicating data):')
    Object.entries(resumeConfig).forEach(([key, value]) => {
      const sectionName = key.replace('SKIP_', '').replace(/_/g, ' ')
      if (value > 0) {
        console.log(
          `   ${sectionName}: Skip first ${value.toLocaleString()} records`
        )
      } else {
        console.log(
          `   ${sectionName}: Start from beginning (no existing records)`
        )
      }
    })

    // Show the logic
    console.log('\n💡 How it works:')
    console.log('   1. Count existing records in each database table')
    console.log('   2. Use those counts as skip values for each seeder')
    console.log(
      '   3. Each seeder skips the first N records (where N = existing count)'
    )
    console.log('   4. This prevents duplicate data insertion')
    console.log('   5. Upsert operations handle any edge cases')

    const totalExisting = Object.values(counts).reduce(
      (sum, count) => sum + count,
      0
    )
    if (totalExisting > 0) {
      console.log(
        '\n🔄 Resume Mode: The seeding will skip existing records and continue from where it left off'
      )
    } else {
      console.log(
        '\n🆕 Fresh Start: No existing records found, seeding will start from the beginning'
      )
    }
  } catch (error) {
    console.error('❌ Error during database check test:', error.message)
    logger.error('Database check test failed', {
      error: error.message,
      stack: error.stack,
    })
  } finally {
    await disconnect()
    console.log('\n🔌 Database connection closed')
  }
}

// Run the test if called directly
if (require.main === module) {
  testDatabaseCheck()
    .then(() => {
      console.log('\n✅ Database check test completed')
    })
    .catch((error) => {
      console.error('\n❌ Database check test failed:', error.message)
      process.exit(1)
    })
}

module.exports = { testDatabaseCheck }
