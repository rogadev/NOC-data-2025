/**
 * Check Economic Regions Mismatches
 * =================================
 *
 * Investigates the specific mismatches in Economic Regions data.
 */

const fs = require('fs')
const xlsx = require('node-xlsx')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function checkEconomicRegions() {
  console.log('🔍 Investigating Economic Regions mismatches...\n')

  try {
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

    console.log(`📊 Source regions: ${sourceRegions.size}`)

    // Load database data
    const dbRegions = await prisma.economicRegion.findMany()
    console.log(`📊 Database regions: ${dbRegions.length}`)

    const dbRegionsMap = new Map(
      dbRegions.map((region) => [region.economicRegionCode, region])
    )

    // Compare and show mismatches
    let mismatches = 0
    console.log('\n🔍 Checking for mismatches...\n')

    for (const [code, sourceRegion] of sourceRegions) {
      const dbRegion = dbRegionsMap.get(code)
      if (dbRegion) {
        const issues = []
        if (dbRegion.province !== sourceRegion.province) {
          issues.push(
            `province: DB="${dbRegion.province}" vs Source="${sourceRegion.province}"`
          )
        }
        if (dbRegion.economicRegionName !== sourceRegion.economicRegionName) {
          issues.push(
            `name: DB="${dbRegion.economicRegionName}" vs Source="${sourceRegion.economicRegionName}"`
          )
        }

        if (issues.length > 0) {
          mismatches++
          console.log(`Region ${code}:`)
          issues.forEach((issue) => console.log(`   ${issue}`))
          console.log()

          if (mismatches >= 10) {
            console.log('... (showing first 10 mismatches only)\n')
            break
          }
        }
      }
    }

    console.log(`📊 Total mismatches found: ${mismatches}`)

    if (mismatches > 0) {
      console.log(
        '\n💡 The mismatches appear to be in the Economic Region names or province codes.'
      )
      console.log('This could be due to:')
      console.log('   1. Different formatting in source vs database')
      console.log('   2. Updates to the source data since last seeding')
      console.log('   3. Data cleaning differences between source and seeder')
    }
  } catch (error) {
    console.error('❌ Error:', error.message)
  } finally {
    await prisma.$disconnect()
  }
}

checkEconomicRegions()
