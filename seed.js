/**
 * NOC Data Seeding Application - Entry Point
 * ==========================================
 *
 * This is the main entry point for the modular seeding application.
 * The actual implementation is in the src/ directory for better organization.
 */

const { main } = require('./src/seed')

// Run the seeding
main().catch(error => {
  console.error('❌ Unhandled error:', error)
  process.exit(1)
})
