/**
 * Progress Checker
 * ===============
 *
 * Utility script to check seeding progress from the progress file.
 */

const fs = require('fs')
const { PROGRESS_FILE } = require('../src/config')

function checkProgress() {
  console.log('📊 Checking seeding progress...\n')

  try {
    if (!fs.existsSync(PROGRESS_FILE)) {
      console.log('❌ No progress file found. Run seeding first.')
      return
    }

    const progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'))

    console.log('📈 Latest Progress:')
    console.log('='.repeat(40))
    console.log(`Operation: ${progress.operation}`)
    console.log(`Timestamp: ${new Date(progress.timestamp).toLocaleString()}`)
    console.log(`Processed: ${progress.processed?.toLocaleString() || 'N/A'}`)
    console.log(`Total: ${progress.total?.toLocaleString() || 'N/A'}`)
    console.log(`Created: ${progress.totalCreated?.toLocaleString() || 'N/A'}`)
    console.log(`Skipped: ${progress.totalSkipped?.toLocaleString() || 'N/A'}`)

    if (progress.processed && progress.total) {
      const percent = ((progress.processed / progress.total) * 100).toFixed(1)
      console.log(`Progress: ${percent}%`)
    }

    if (progress.resumeConfig) {
      console.log('\n🔄 Resume Configuration:')
      Object.entries(progress.resumeConfig).forEach(([key, value]) => {
        console.log(`   ${key}: ${value}`)
      })
    }
  } catch (error) {
    console.error('❌ Error reading progress:', error.message)
  }
}

// Run if called directly
if (require.main === module) {
  checkProgress()
}

module.exports = { checkProgress }
