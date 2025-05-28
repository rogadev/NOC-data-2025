/**
 * Progress Tracking Utilities
 * ===========================
 */

const fs = require('fs')
const { PROGRESS_FILE, SPINNER_CHARS } = require('../config')

// Progress tracking state
let totalRecordsToCreate = 0
let totalRecordsCreated = 0
let totalRecordsSkipped = 0
let progressSpinner = 0
let lastProgressTime = Date.now()
let startTime = Date.now()
let lastProgressLength = 0 // Track length of last progress line

/**
 * Initialize progress tracking
 */
function initializeProgress() {
  startTime = Date.now()
  lastProgressTime = Date.now()
  totalRecordsCreated = 0
  totalRecordsSkipped = 0
  progressSpinner = 0
}

/**
 * Set the total number of records to be created
 */
function setTotalRecords(total) {
  totalRecordsToCreate = total
}

/**
 * Increment created records counter
 */
function incrementCreated() {
  totalRecordsCreated++
}

/**
 * Increment skipped records counter
 */
function incrementSkipped() {
  totalRecordsSkipped++
}

/**
 * Enhanced progress logging with percentage, spinner, and timestamps
 */
function logProgress(
  forceNewLine = false,
  batchNum = null,
  totalBatches = null
) {
  const currentTime = Date.now()
  const timeSinceLastUpdate = currentTime - lastProgressTime

  const totalProcessed = totalRecordsCreated + totalRecordsSkipped
  const overallPercent =
    totalRecordsToCreate > 0
      ? ((totalProcessed / totalRecordsToCreate) * 100).toFixed(1)
      : '0.0'

  // Calculate elapsed time
  const elapsedSeconds = ((currentTime - startTime) / 1000).toFixed(1)

  // Build progress text
  let progressText = ''
  if (batchNum && totalBatches) {
    progressText += `Batch ${batchNum}/${totalBatches} | `
  }
  progressText += `Overall: ${overallPercent}% | Elapsed Time: ${elapsedSeconds} sec`

  // Add timestamp every 5 seconds or on force
  const shouldAddTimestamp = timeSinceLastUpdate > 5000 || forceNewLine
  if (shouldAddTimestamp) {
    const timestamp = new Date().toLocaleTimeString()
    progressText += ` [${timestamp}]`
    lastProgressTime = currentTime
  }

  // Only log if enough time has passed or it's forced
  if (timeSinceLastUpdate > 1000 || forceNewLine) {
    // Clear the current line first
    process.stdout.write('\r' + ' '.repeat(lastProgressLength) + '\r')
    process.stdout.write(progressText)
    lastProgressLength = progressText.length
  }
}

/**
 * Save current progress to file for resume capability
 */
function saveProgress(operationName, processed, total) {
  try {
    const progress = {
      timestamp: new Date().toISOString(),
      operation: operationName,
      processed,
      total,
      totalCreated: totalRecordsCreated,
      totalSkipped: totalRecordsSkipped,
    }
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2))
  } catch (error) {
    console.warn('⚠️  Could not save progress:', error.message)
  }
}

/**
 * Get current progress statistics
 */
function getProgressStats() {
  const elapsedSeconds = (Date.now() - startTime) / 1000
  const totalProcessed = totalRecordsCreated + totalRecordsSkipped
  const rate =
    elapsedSeconds > 0 ? (totalProcessed / elapsedSeconds).toFixed(1) : '0'
  const percentComplete =
    totalRecordsToCreate > 0
      ? ((totalProcessed / totalRecordsToCreate) * 100).toFixed(1)
      : '0.0'

  return {
    totalCreated: totalRecordsCreated,
    totalSkipped: totalRecordsSkipped,
    totalProcessed,
    elapsedSeconds: elapsedSeconds.toFixed(1),
    rate,
    percentComplete,
  }
}

module.exports = {
  initializeProgress,
  setTotalRecords,
  incrementCreated,
  incrementSkipped,
  logProgress,
  saveProgress,
  getProgressStats,
}
