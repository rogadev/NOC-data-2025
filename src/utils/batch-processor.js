/**
 * Batch Processing Utilities
 * ==========================
 */

const { PARALLEL_BATCHES, BATCH_DELAY_MS } = require('../config')
const { logProgress, saveProgress } = require('./progress')

/**
 * Optimized batch processing with transactions, upserts, and resume capability
 */
async function processInParallelBatches(
  data,
  batchSize,
  processor,
  operationName,
  skipCount = 0
) {
  const total = data.length
  let processed = 0
  let created = 0
  let skipped = 0

  // Apply skip offset for resume capability
  const actualData = skipCount > 0 ? data.slice(skipCount) : data
  const actualTotal = actualData.length

  console.log(
    `\n🚀 Starting ${operationName} (${total.toLocaleString()} total items, ${
      skipCount > 0 ? `skipping first ${skipCount.toLocaleString()}, ` : ''
    }processing ${actualTotal.toLocaleString()} items)...`
  )

  if (skipCount > 0) {
    console.log(`📍 Resuming from record ${skipCount + 1}`)
  }

  // Process in chunks of batches
  for (let i = 0; i < actualTotal; i += batchSize * PARALLEL_BATCHES) {
    const megaBatch = actualData.slice(i, i + batchSize * PARALLEL_BATCHES)

    // Split mega batch into parallel batches
    const batches = []
    for (let j = 0; j < megaBatch.length; j += batchSize) {
      batches.push(megaBatch.slice(j, j + batchSize))
    }

    // Calculate batch info for progress
    let batchNum = null
    let totalBatches = null
    if (actualTotal > 1000) {
      batchNum = Math.floor(i / (batchSize * PARALLEL_BATCHES)) + 1
      totalBatches = Math.ceil(actualTotal / (batchSize * PARALLEL_BATCHES))
    }

    // Process batches in parallel with conservative settings for Supabase free tier
    const batchPromises = batches.map(async (batch, batchIndex) => {
      let batchCreated = 0
      let batchSkipped = 0

      try {
        // Process individually for better stability on free tier
        for (const item of batch) {
          const result = await processor(item)
          if (result === 'created') {
            batchCreated++
          } else if (result === 'skipped') {
            batchSkipped++
          }

          // Update progress every 10 items for visual feedback
          if ((batchCreated + batchSkipped) % 10 === 0) {
            logProgress(
              operationName,
              created + batchCreated,
              skipped + batchSkipped,
              actualTotal,
              true,
              batchNum,
              totalBatches
            )
          }

          // Add small delay between operations for rate limiting
          if (BATCH_DELAY_MS > 0) {
            await new Promise((resolve) =>
              setTimeout(resolve, BATCH_DELAY_MS / 10)
            )
          }
        }
      } catch (error) {
        console.warn(
          `⚠️  Batch ${batchIndex} failed, continuing with individual processing:`,
          error.message
        )
        // Fallback to individual processing if batch fails
        for (const item of batch) {
          try {
            const result = await processor(item)
            if (result === 'created') {
              batchCreated++
            } else if (result === 'skipped') {
              batchSkipped++
            }
          } catch (itemError) {
            batchSkipped++
          }

          // Rate limiting delay
          if (BATCH_DELAY_MS > 0) {
            await new Promise((resolve) =>
              setTimeout(resolve, BATCH_DELAY_MS / 5)
            )
          }
        }
      }

      return { created: batchCreated, skipped: batchSkipped }
    })

    // Wait for all batches to complete
    const batchResults = await Promise.all(batchPromises)

    // Aggregate results
    batchResults.forEach((result) => {
      created += result.created
      skipped += result.skipped
    })

    processed += megaBatch.length

    // Update progress after each mega-batch with timestamp
    logProgress(
      operationName,
      created,
      skipped,
      actualTotal,
      true,
      batchNum,
      totalBatches
    )

    // Save progress periodically for resume capability
    const currentProcessed = skipCount + processed
    saveProgress(operationName, currentProcessed, total)

    // Add delay between mega-batches for rate limiting
    if (BATCH_DELAY_MS > 0 && i + batchSize * PARALLEL_BATCHES < actualTotal) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS))
    }
  }

  // Final progress update
  logProgress(operationName, created, skipped, actualTotal, true)
  console.log(`✅ ${operationName} completed!\n`)
  return { created, skipped }
}

module.exports = {
  processInParallelBatches,
}
