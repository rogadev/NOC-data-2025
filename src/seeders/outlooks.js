/**
 * Outlooks and Economic Regions Seeder
 * ====================================
 */

const xlsx = require('node-xlsx')
const { BATCH_SIZE } = require('../config')
const { safeDbOperation, prisma } = require('../utils/database')
const { processInParallelBatches } = require('../utils/batch-processor')
const { incrementSkipped } = require('../utils/progress')

/**
 * Seed Economic Regions and Outlooks
 */
async function seedOutlooks(skipCount = 0) {
  console.log('🗺️  Seeding Economic Regions and Outlooks...')

  const workbook = xlsx.parse('data/2024-2026-3-year-outlooks.xlsx')
  const rawData = workbook[0].data
  const headers = rawData[0] // First row contains headers
  const outlookData = rawData.slice(1) // Remove header row

  // Convert array data to objects using headers
  const outlookObjects = outlookData.map(row => {
    const obj = {}
    headers.forEach((header, index) => {
      obj[header] = row[index]
    })
    return obj
  })

  // Extract unique economic regions
  const regionsMap = new Map()
  outlookObjects.forEach(row => {
    const regionCode = String(row['Economic Region Code'] || '')
    const regionName = String(row['Economic Region'] || '')
    const province = String(row.Province || '')

    if (regionCode && !regionsMap.has(regionCode)) {
      regionsMap.set(regionCode, {
        economicRegionCode: regionCode,
        province,
        economicRegionName: regionName || null,
      })
    }
  })

  // Seed economic regions in parallel with upserts
  console.log('🗺️  Seeding Economic Regions...')
  const regions = Array.from(regionsMap.values())
  const regionPromises = regions.map(async region => {
    return await safeDbOperation(
      () =>
        prisma.economicRegion.upsert({
          where: { economicRegionCode: region.economicRegionCode },
          update: {
            province: region.province,
            economicRegionName: region.economicRegionName,
          },
          create: region,
        }),
      `Economic Region: ${region.economicRegionCode}`,
    )
  })

  await Promise.all(regionPromises)

  // Seed outlooks
  console.log('📈 Seeding Outlooks...')

  const processor = async row => {
    // Extract NOC code (remove "NOC_" prefix if present)
    let nocCode = String(row.NOC_Code || '')
    if (nocCode.startsWith('NOC_')) {
      nocCode = nocCode.substring(4)
    }

    const economicRegionCode = String(row['Economic Region Code'] || '')
    const province = String(row.Province || '')
    const outlook = String(row.Outlook || '')
    const employmentTrends = String(row['Employment Trends'] || '')
    const language = String(row.LANG || 'EN')

    // Parse release date
    let releaseDate
    try {
      const dateValue = row['Release Date']
      if (dateValue) {
        releaseDate = new Date(dateValue)
      } else {
        releaseDate = new Date('2024-01-01')
      }
    } catch (error) {
      releaseDate = new Date('2024-01-01')
    }

    // Validate required fields
    if (!nocCode || !economicRegionCode || !province || !outlook) {
      incrementSkipped()
      return 'skipped'
    }

    // Use upsert to create or update the outlook
    const result = await safeDbOperation(
      () =>
        prisma.outlook.upsert({
          where: {
            nocCode_economicRegionCode_province_releaseDate_language: {
              nocCode,
              economicRegionCode,
              province,
              releaseDate,
              language,
            },
          },
          update: {
            outlook,
            employmentTrends: employmentTrends || null,
          },
          create: {
            nocCode,
            economicRegionCode,
            outlook,
            employmentTrends: employmentTrends || null,
            releaseDate,
            province,
            language,
          },
        }),
      `Outlook: ${nocCode} - ${economicRegionCode}`,
    )

    return result ? 'created' : 'error'
  }

  return await processInParallelBatches(
    outlookObjects,
    BATCH_SIZE,
    processor,
    'Outlooks',
    skipCount,
  )
}

module.exports = {
  seedOutlooks,
}
