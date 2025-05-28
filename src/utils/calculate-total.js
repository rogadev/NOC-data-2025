/**
 * Calculate Total Records Utility
 * ==============================
 */

const fs = require('fs')
const xlsx = require('node-xlsx')
const { SEED_CONFIG } = require('../config')

/**
 * Calculate total records we'll be creating (only for enabled sections)
 */
async function calculateTotalRecords() {
  console.log('📊 Calculating total records for enabled sections...')

  try {
    let total = 0

    if (SEED_CONFIG.PROGRAM_AREAS) {
      const viuPrograms = JSON.parse(
        fs.readFileSync('data/viu_programs.json', 'utf8'),
      )
      const programAreas = new Set()
      viuPrograms.forEach(p => {
        if (p.program_area) programAreas.add(p.program_area.nid)
      })
      total += programAreas.size
      console.log(`   Program Areas: ${programAreas.size.toLocaleString()}`)
    }

    if (SEED_CONFIG.PROGRAMS) {
      const viuPrograms = JSON.parse(
        fs.readFileSync('data/viu_programs.json', 'utf8'),
      )
      total += viuPrograms.length
      console.log(`   Programs: ${viuPrograms.length.toLocaleString()}`)
    }

    if (SEED_CONFIG.NOC_UNIT_GROUPS) {
      const unitGroups = JSON.parse(
        fs.readFileSync('data/unit_groups.json', 'utf8'),
      )
      let sectionCount = 0
      unitGroups.forEach(ug => {
        if (ug.sections) sectionCount += ug.sections.length
      })
      total += unitGroups.length + sectionCount
      console.log(`   NOC Unit Groups: ${unitGroups.length.toLocaleString()}`)
      console.log(`   NOC Sections: ${sectionCount.toLocaleString()}`)
    }

    if (SEED_CONFIG.OUTLOOKS) {
      const workbook = xlsx.parse('data/2024-2026-3-year-outlooks.xlsx')
      const outlookData = workbook[0].data.slice(1) // Remove header row

      // Count unique regions
      const regions = new Set()
      const rawData = workbook[0].data
      const headers = rawData[0]
      const outlookObjects = outlookData.map(row => {
        const obj = {}
        headers.forEach((header, index) => {
          obj[header] = row[index]
        })
        return obj
      })

      outlookObjects.forEach(row => {
        const regionCode = String(row['Economic Region Code'] || '')
        if (regionCode) regions.add(regionCode)
      })

      total += regions.size + outlookData.length
      console.log(`   Economic Regions: ${regions.size.toLocaleString()}`)
      console.log(`   Outlooks: ${outlookData.length.toLocaleString()}`)
    }

    if (SEED_CONFIG.PROGRAM_NOC_LINKS) {
      const viuPrograms = JSON.parse(
        fs.readFileSync('data/viu_programs.json', 'utf8'),
      )
      let linkCount = 0
      viuPrograms.forEach(p => {
        if (p.known_noc_groups) linkCount += p.known_noc_groups.length
      })
      total += linkCount
      console.log(`   Program-NOC Links: ${linkCount.toLocaleString()}`)
    }

    console.log(`📈 Total estimated records: ${total.toLocaleString()}`)
    return total
  } catch (error) {
    console.error('❌ Error calculating total records:', error.message)
    return 10000 // Fallback estimate
  }
}

module.exports = {
  calculateTotalRecords,
}
