/**
 * Data Integrity Repair Script
 * ============================
 *
 * Repairs data discrepancies by updating the database with source data.
 * Source files are considered the single source of truth.
 */

const fs = require('fs')
const xlsx = require('node-xlsx')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

class DataRepairer {
  constructor() {
    this.repairStats = {
      economicRegions: { updated: 0, created: 0, errors: 0 },
      outlooks: { created: 0, errors: 0 },
      programNocLinks: { created: 0, errors: 0 },
    }
  }

  /**
   * Repair Economic Regions
   */
  async repairEconomicRegions() {
    console.log('🔧 Repairing Economic Regions...')

    // Load source data
    const workbook = xlsx.parse('data/2024-2026-3-year-outlooks.xlsx')
    const rawData = workbook[0].data
    const headers = rawData[0]
    const outlookData = rawData.slice(1)

    // Convert to objects
    const outlookObjects = outlookData.map((row) => {
      const obj = {}
      headers.forEach((header, index) => {
        obj[header] = row[index]
      })
      return obj
    })

    // Extract unique economic regions from source
    const sourceRegions = new Map()

    outlookObjects.forEach((row) => {
      const regionCode = String(row['Economic Region Code'] || '')
      const regionName = String(row['Economic Region Name'] || '')
      const province = String(row.Province || '')

      if (regionCode && !sourceRegions.has(regionCode)) {
        sourceRegions.set(regionCode, {
          economicRegionCode: regionCode,
          province,
          economicRegionName: regionName || null,
        })
      }
    })

    console.log(`   Found ${sourceRegions.size} regions in source data`)

    // Update each region
    for (const [code, sourceRegion] of sourceRegions) {
      try {
        const result = await prisma.economicRegion.upsert({
          where: { economicRegionCode: code },
          update: {
            province: sourceRegion.province,
            economicRegionName: sourceRegion.economicRegionName,
          },
          create: sourceRegion,
        })

        if (result) {
          this.repairStats.economicRegions.updated++
        }
      } catch (error) {
        console.error(`   ❌ Error updating region ${code}:`, error.message)
        this.repairStats.economicRegions.errors++
      }
    }

    console.log(
      `   ✅ Updated ${this.repairStats.economicRegions.updated} regions`
    )
    if (this.repairStats.economicRegions.errors > 0) {
      console.log(
        `   ⚠️  ${this.repairStats.economicRegions.errors} errors occurred`
      )
    }
  }

  /**
   * Repair missing Outlooks
   */
  async repairOutlooks() {
    console.log('🔧 Repairing missing Outlooks...')

    // Load source data
    console.log('   📖 Loading source data from Excel...')
    const workbook = xlsx.parse('data/2024-2026-3-year-outlooks.xlsx')
    const rawData = workbook[0].data
    const headers = rawData[0]
    const outlookData = rawData.slice(1)

    // Convert to objects
    console.log('   🔄 Converting Excel data to objects...')
    const outlookObjects = outlookData.map((row) => {
      const obj = {}
      headers.forEach((header, index) => {
        obj[header] = row[index]
      })
      return obj
    })

    // Process outlook records
    console.log('   🔄 Processing outlook records...')
    const sourceOutlooks = []

    outlookObjects.forEach((row, index) => {
      // Progress indicator for large datasets
      if (index % 10000 === 0 && index > 0) {
        console.log(`      Processed ${index}/${outlookObjects.length} rows...`)
      }

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
      if (nocCode && economicRegionCode && province && outlook) {
        sourceOutlooks.push({
          nocCode,
          economicRegionCode,
          outlook,
          employmentTrends: employmentTrends || null,
          releaseDate,
          province,
          language,
        })
      }
    })

    console.log(
      `   ✅ Found ${sourceOutlooks.length} valid outlooks in source data`
    )

    // Get current database count
    console.log('   📊 Checking current database count...')
    const currentCount = await prisma.outlook.count()
    console.log(`   📊 Current database count: ${currentCount}`)

    if (sourceOutlooks.length > currentCount) {
      const missingCount = sourceOutlooks.length - currentCount
      console.log(`   🔧 Need to create ${missingCount} missing outlooks`)

      // Process in smaller batches with better progress tracking
      const batchSize = 50 // Reduced batch size for more frequent updates
      let created = 0
      let errors = 0
      const startTime = Date.now()

      for (let i = 0; i < sourceOutlooks.length; i += batchSize) {
        const batch = sourceOutlooks.slice(i, i + batchSize)
        const batchNumber = Math.floor(i / batchSize) + 1
        const totalBatches = Math.ceil(sourceOutlooks.length / batchSize)

        console.log(
          `   📦 Processing batch ${batchNumber}/${totalBatches} (records ${i + 1}-${Math.min(i + batchSize, sourceOutlooks.length)})...`
        )

        for (const outlook of batch) {
          try {
            await prisma.outlook.upsert({
              where: {
                nocCode_economicRegionCode_province_releaseDate_language: {
                  nocCode: outlook.nocCode,
                  economicRegionCode: outlook.economicRegionCode,
                  province: outlook.province,
                  releaseDate: outlook.releaseDate,
                  language: outlook.language,
                },
              },
              update: {
                outlook: outlook.outlook,
                employmentTrends: outlook.employmentTrends,
              },
              create: outlook,
            })
            created++
          } catch (error) {
            errors++
            if (errors <= 5) {
              // Show first few errors
              console.log(
                `      ⚠️  Error creating outlook for NOC ${outlook.nocCode}: ${error.message}`
              )
            }
          }
        }

        // Progress update with time estimation
        const elapsed = Date.now() - startTime
        const rate = ((i + batchSize) / elapsed) * 1000 // records per second
        const remaining = sourceOutlooks.length - (i + batchSize)
        const eta = remaining / rate / 60 // minutes

        console.log(
          `      ✅ Batch complete. Created: ${created}, Errors: ${errors}`
        )
        if (eta > 0 && eta < 60) {
          console.log(`      ⏱️  ETA: ${eta.toFixed(1)} minutes remaining`)
        }
      }

      this.repairStats.outlooks.created = created
      this.repairStats.outlooks.errors = errors
      console.log(`   ✅ Completed! Created/updated ${created} outlooks`)
    } else {
      console.log(`   ✅ All outlooks are already in the database`)
    }

    if (this.repairStats.outlooks.errors > 0) {
      console.log(`   ⚠️  ${this.repairStats.outlooks.errors} errors occurred`)
    }
  }

  /**
   * Repair missing Program-NOC Links
   */
  async repairProgramNocLinks() {
    console.log('🔧 Repairing missing Program-NOC Links...')

    // Load source data
    console.log('   📖 Loading VIU programs data...')
    const viuPrograms = JSON.parse(
      fs.readFileSync('data/viu_programs.json', 'utf8')
    )
    const sourceLinks = []

    console.log('   🔄 Processing program NOC links...')
    viuPrograms.forEach((program) => {
      if (program.known_noc_groups && Array.isArray(program.known_noc_groups)) {
        program.known_noc_groups.forEach((nocCode) => {
          sourceLinks.push({
            programId: program.nid,
            nocCode: nocCode,
            isKnown: true,
            confidence: 1.0,
          })
        })
      }
    })

    console.log(`   ✅ Found ${sourceLinks.length} links in source data`)

    // Get current database count
    console.log('   📊 Checking current database count...')
    const currentCount = await prisma.programNocLink.count()
    console.log(`   📊 Current database count: ${currentCount}`)

    if (sourceLinks.length > currentCount) {
      const missingCount = sourceLinks.length - currentCount
      console.log(`   🔧 Need to create ${missingCount} missing links`)

      let created = 0
      let errors = 0

      for (let i = 0; i < sourceLinks.length; i++) {
        const link = sourceLinks[i]

        // Progress update every 5 links
        if (i % 5 === 0 && i > 0) {
          console.log(`   📦 Processing link ${i + 1}/${sourceLinks.length}...`)
        }

        try {
          await prisma.programNocLink.upsert({
            where: {
              programId_nocCode: {
                programId: link.programId,
                nocCode: link.nocCode,
              },
            },
            update: {
              isKnown: link.isKnown,
              confidence: link.confidence,
            },
            create: link,
          })
          created++
        } catch (error) {
          errors++
          if (errors <= 3) {
            // Show first few errors
            console.log(
              `      ⚠️  Error creating link for Program ${link.programId} -> NOC ${link.nocCode}: ${error.message}`
            )
          }
        }
      }

      this.repairStats.programNocLinks.created = created
      this.repairStats.programNocLinks.errors = errors
      console.log(`   ✅ Completed! Created/updated ${created} links`)
    } else {
      console.log(`   ✅ All links are already in the database`)
    }

    if (this.repairStats.programNocLinks.errors > 0) {
      console.log(
        `   ⚠️  ${this.repairStats.programNocLinks.errors} errors occurred`
      )
    }
  }

  /**
   * Generate repair report
   */
  generateReport() {
    console.log('\n' + '='.repeat(80))
    console.log('🔧 DATA REPAIR SUMMARY')
    console.log('='.repeat(80))

    console.log('\n📊 Economic Regions:')
    console.log(`   Updated: ${this.repairStats.economicRegions.updated}`)
    console.log(`   Errors: ${this.repairStats.economicRegions.errors}`)

    console.log('\n📊 Outlooks:')
    console.log(`   Created/Updated: ${this.repairStats.outlooks.created}`)
    console.log(`   Errors: ${this.repairStats.outlooks.errors}`)

    console.log('\n📊 Program-NOC Links:')
    console.log(
      `   Created/Updated: ${this.repairStats.programNocLinks.created}`
    )
    console.log(`   Errors: ${this.repairStats.programNocLinks.errors}`)

    const totalUpdates =
      this.repairStats.economicRegions.updated +
      this.repairStats.outlooks.created +
      this.repairStats.programNocLinks.created
    const totalErrors =
      this.repairStats.economicRegions.errors +
      this.repairStats.outlooks.errors +
      this.repairStats.programNocLinks.errors

    console.log('\n' + '='.repeat(80))
    if (totalUpdates > 0) {
      console.log(
        `✅ REPAIR COMPLETED - ${totalUpdates} records updated/created`
      )
    } else {
      console.log('✅ NO REPAIRS NEEDED - All data is already correct')
    }

    if (totalErrors > 0) {
      console.log(`⚠️  ${totalErrors} errors occurred during repair`)
    }
    console.log('='.repeat(80))
  }

  /**
   * Run complete repair
   */
  async repair() {
    console.log('🔧 Starting data integrity repair...\n')

    try {
      await this.repairEconomicRegions()
      await this.repairOutlooks()
      await this.repairProgramNocLinks()

      this.generateReport()
    } catch (error) {
      console.error('❌ Repair failed:', error.message)
      throw error
    } finally {
      await prisma.$disconnect()
    }
  }
}

// Run repair if called directly
if (require.main === module) {
  const repairer = new DataRepairer()
  repairer.repair().catch(console.error)
}

module.exports = { DataRepairer }
