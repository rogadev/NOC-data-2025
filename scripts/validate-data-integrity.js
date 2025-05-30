/**
 * Data Integrity Validation Script
 * ================================
 *
 * Compares database records against source files to ensure data integrity.
 * Source files are considered the single source of truth.
 */

const fs = require('fs')
const xlsx = require('node-xlsx')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

class DataValidator {
  constructor() {
    this.discrepancies = {
      programAreas: [],
      programs: [],
      nocUnitGroups: [],
      nocSections: [],
      economicRegions: [],
      outlooks: [],
      programNocLinks: [],
    }
    this.stats = {
      programAreas: { source: 0, db: 0, matches: 0, missing: 0, extra: 0 },
      programs: { source: 0, db: 0, matches: 0, missing: 0, extra: 0 },
      nocUnitGroups: { source: 0, db: 0, matches: 0, missing: 0, extra: 0 },
      nocSections: { source: 0, db: 0, matches: 0, missing: 0, extra: 0 },
      economicRegions: { source: 0, db: 0, matches: 0, missing: 0, extra: 0 },
      outlooks: { source: 0, db: 0, matches: 0, missing: 0, extra: 0 },
      programNocLinks: { source: 0, db: 0, matches: 0, missing: 0, extra: 0 },
    }
  }

  /**
   * Validate Program Areas
   */
  async validateProgramAreas() {
    console.log('🔍 Validating Program Areas...')

    // Load source data - program_area is an object with nid and title
    const viuPrograms = JSON.parse(
      fs.readFileSync('data/viu_programs.json', 'utf8')
    )
    const sourceAreas = new Map()

    viuPrograms.forEach((program) => {
      if (
        program.program_area &&
        program.program_area.nid &&
        program.program_area.title
      ) {
        sourceAreas.set(program.program_area.nid, {
          nid: program.program_area.nid,
          title: program.program_area.title,
        })
      }
    })

    this.stats.programAreas.source = sourceAreas.size

    // Load database data
    const dbAreas = await prisma.programArea.findMany()
    this.stats.programAreas.db = dbAreas.length

    const dbAreasMap = new Map(dbAreas.map((area) => [area.nid, area]))

    // Compare
    for (const [nid, sourceArea] of sourceAreas) {
      const dbArea = dbAreasMap.get(nid)
      if (!dbArea) {
        this.stats.programAreas.missing++
        this.discrepancies.programAreas.push({
          type: 'missing',
          nid,
          source: sourceArea,
          db: null,
        })
      } else if (dbArea.title !== sourceArea.title) {
        this.discrepancies.programAreas.push({
          type: 'mismatch',
          nid,
          source: sourceArea,
          db: dbArea,
          field: 'title',
        })
        this.stats.programAreas.matches++
      } else {
        this.stats.programAreas.matches++
      }
    }

    // Check for extra records in DB
    for (const dbArea of dbAreas) {
      if (!sourceAreas.has(dbArea.nid)) {
        this.stats.programAreas.extra++
        this.discrepancies.programAreas.push({
          type: 'extra',
          nid: dbArea.nid,
          source: null,
          db: dbArea,
        })
      }
    }
  }

  /**
   * Validate Programs
   */
  async validatePrograms() {
    console.log('🔍 Validating Programs...')

    // Load source data
    const viuPrograms = JSON.parse(
      fs.readFileSync('data/viu_programs.json', 'utf8')
    )
    this.stats.programs.source = viuPrograms.length

    // Load database data
    const dbPrograms = await prisma.program.findMany({
      include: { programArea: true },
    })
    this.stats.programs.db = dbPrograms.length

    const dbProgramsMap = new Map(
      dbPrograms.map((program) => [program.nid, program])
    )

    // Compare
    for (const sourceProgram of viuPrograms) {
      const dbProgram = dbProgramsMap.get(sourceProgram.nid)
      if (!dbProgram) {
        this.stats.programs.missing++
        this.discrepancies.programs.push({
          type: 'missing',
          nid: sourceProgram.nid,
          source: sourceProgram,
          db: null,
        })
      } else {
        // Check for field mismatches
        const mismatches = []
        if (dbProgram.title !== sourceProgram.title) mismatches.push('title')
        if (dbProgram.duration !== (sourceProgram.duration || null))
          mismatches.push('duration')
        if (dbProgram.credential !== sourceProgram.credential)
          mismatches.push('credential')

        if (mismatches.length > 0) {
          this.discrepancies.programs.push({
            type: 'mismatch',
            nid: sourceProgram.nid,
            source: sourceProgram,
            db: dbProgram,
            fields: mismatches,
          })
        }
        this.stats.programs.matches++
      }
    }

    // Check for extra records in DB
    for (const dbProgram of dbPrograms) {
      const sourceProgram = viuPrograms.find((p) => p.nid === dbProgram.nid)
      if (!sourceProgram) {
        this.stats.programs.extra++
        this.discrepancies.programs.push({
          type: 'extra',
          nid: dbProgram.nid,
          source: null,
          db: dbProgram,
        })
      }
    }
  }

  /**
   * Validate NOC Unit Groups
   */
  async validateNocUnitGroups() {
    console.log('🔍 Validating NOC Unit Groups...')

    // Load source data - uses noc_number field
    const unitGroups = JSON.parse(
      fs.readFileSync('data/unit_groups.json', 'utf8')
    )
    this.stats.nocUnitGroups.source = unitGroups.length

    // Load database data
    const dbNocGroups = await prisma.nocUnitGroup.findMany()
    this.stats.nocUnitGroups.db = dbNocGroups.length

    const dbNocGroupsMap = new Map(dbNocGroups.map((noc) => [noc.nocCode, noc]))

    // Compare
    for (const sourceNoc of unitGroups) {
      const dbNoc = dbNocGroupsMap.get(sourceNoc.noc_number)
      if (!dbNoc) {
        this.stats.nocUnitGroups.missing++
        this.discrepancies.nocUnitGroups.push({
          type: 'missing',
          nocCode: sourceNoc.noc_number,
          source: sourceNoc,
          db: null,
        })
      } else if (dbNoc.occupation !== sourceNoc.occupation) {
        this.discrepancies.nocUnitGroups.push({
          type: 'mismatch',
          nocCode: sourceNoc.noc_number,
          source: sourceNoc,
          db: dbNoc,
          field: 'occupation',
        })
        this.stats.nocUnitGroups.matches++
      } else {
        this.stats.nocUnitGroups.matches++
      }
    }

    // Check for extra records in DB
    for (const dbNoc of dbNocGroups) {
      const sourceNoc = unitGroups.find((n) => n.noc_number === dbNoc.nocCode)
      if (!sourceNoc) {
        this.stats.nocUnitGroups.extra++
        this.discrepancies.nocUnitGroups.push({
          type: 'extra',
          nocCode: dbNoc.nocCode,
          source: null,
          db: dbNoc,
        })
      }
    }
  }

  /**
   * Validate NOC Sections
   */
  async validateNocSections() {
    console.log('🔍 Validating NOC Sections...')

    // Load source data - uses noc_number field
    const unitGroups = JSON.parse(
      fs.readFileSync('data/unit_groups.json', 'utf8')
    )
    let sourceSectionsCount = 0
    const sourceSections = new Map()

    unitGroups.forEach((unitGroup) => {
      if (unitGroup.sections && Array.isArray(unitGroup.sections)) {
        unitGroup.sections.forEach((section) => {
          sourceSectionsCount++
          const key = `${unitGroup.noc_number}-${section.title}`
          sourceSections.set(key, {
            nocCode: unitGroup.noc_number,
            title: section.title,
            items: section.items || [],
          })
        })
      }
    })

    this.stats.nocSections.source = sourceSectionsCount

    // Load database data
    const dbSections = await prisma.nocSection.findMany()
    this.stats.nocSections.db = dbSections.length

    const dbSectionsMap = new Map()
    dbSections.forEach((section) => {
      const key = `${section.nocCode}-${section.title}`
      dbSectionsMap.set(key, section)
    })

    // Compare
    for (const [key, sourceSection] of sourceSections) {
      const dbSection = dbSectionsMap.get(key)
      if (!dbSection) {
        this.stats.nocSections.missing++
        this.discrepancies.nocSections.push({
          type: 'missing',
          key,
          source: sourceSection,
          db: null,
        })
      } else {
        // Compare items arrays
        const sourceItems = JSON.stringify((sourceSection.items || []).sort())
        const dbItems = JSON.stringify((dbSection.items || []).sort())

        if (sourceItems !== dbItems) {
          this.discrepancies.nocSections.push({
            type: 'mismatch',
            key,
            source: sourceSection,
            db: dbSection,
            field: 'items',
          })
        }
        this.stats.nocSections.matches++
      }
    }

    // Check for extra records in DB
    for (const dbSection of dbSections) {
      const key = `${dbSection.nocCode}-${dbSection.title}`
      if (!sourceSections.has(key)) {
        this.stats.nocSections.extra++
        this.discrepancies.nocSections.push({
          type: 'extra',
          key,
          source: null,
          db: dbSection,
        })
      }
    }
  }

  /**
   * Validate Economic Regions and Outlooks
   */
  async validateOutlooks() {
    console.log('🔍 Validating Economic Regions and Outlooks...')

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
    const sourceOutlooks = []

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

      // Process outlook record
      let nocCode = String(row.NOC_Code || '')
      if (nocCode.startsWith('NOC_')) {
        nocCode = nocCode.substring(4)
      }

      const economicRegionCode = String(row['Economic Region Code'] || '')
      const outlook = String(row.Outlook || '')
      const employmentTrends = String(row['Employment Trends'] || '')
      const language = String(row.LANG || 'EN')

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

    this.stats.economicRegions.source = sourceRegions.size
    this.stats.outlooks.source = sourceOutlooks.length

    // Validate Economic Regions
    const dbRegions = await prisma.economicRegion.findMany()
    this.stats.economicRegions.db = dbRegions.length

    const dbRegionsMap = new Map(
      dbRegions.map((region) => [region.economicRegionCode, region])
    )

    for (const [code, sourceRegion] of sourceRegions) {
      const dbRegion = dbRegionsMap.get(code)
      if (!dbRegion) {
        this.stats.economicRegions.missing++
        this.discrepancies.economicRegions.push({
          type: 'missing',
          code,
          source: sourceRegion,
          db: null,
        })
      } else {
        const mismatches = []
        if (dbRegion.province !== sourceRegion.province)
          mismatches.push('province')
        if (dbRegion.economicRegionName !== sourceRegion.economicRegionName)
          mismatches.push('economicRegionName')

        if (mismatches.length > 0) {
          this.discrepancies.economicRegions.push({
            type: 'mismatch',
            code,
            source: sourceRegion,
            db: dbRegion,
            fields: mismatches,
          })
        }
        this.stats.economicRegions.matches++
      }
    }

    // Check for extra regions in DB
    for (const dbRegion of dbRegions) {
      if (!sourceRegions.has(dbRegion.economicRegionCode)) {
        this.stats.economicRegions.extra++
        this.discrepancies.economicRegions.push({
          type: 'extra',
          code: dbRegion.economicRegionCode,
          source: null,
          db: dbRegion,
        })
      }
    }

    // Validate Outlooks
    const dbOutlooks = await prisma.outlook.findMany()
    this.stats.outlooks.db = dbOutlooks.length

    // Create lookup keys for comparison
    const sourceOutlookKeys = new Set()
    const dbOutlookKeys = new Set()

    sourceOutlooks.forEach((outlook) => {
      const key = `${outlook.nocCode}-${outlook.economicRegionCode}-${outlook.province}-${outlook.releaseDate.toISOString()}-${outlook.language}`
      sourceOutlookKeys.add(key)
    })

    dbOutlooks.forEach((outlook) => {
      const key = `${outlook.nocCode}-${outlook.economicRegionCode}-${outlook.province}-${outlook.releaseDate.toISOString()}-${outlook.language}`
      dbOutlookKeys.add(key)
    })

    // Count matches and differences
    for (const key of sourceOutlookKeys) {
      if (dbOutlookKeys.has(key)) {
        this.stats.outlooks.matches++
      } else {
        this.stats.outlooks.missing++
      }
    }

    for (const key of dbOutlookKeys) {
      if (!sourceOutlookKeys.has(key)) {
        this.stats.outlooks.extra++
      }
    }
  }

  /**
   * Validate Program-NOC Links
   */
  async validateProgramNocLinks() {
    console.log('🔍 Validating Program-NOC Links...')

    // Load source data
    const viuPrograms = JSON.parse(
      fs.readFileSync('data/viu_programs.json', 'utf8')
    )
    const sourceLinks = []

    viuPrograms.forEach((program) => {
      if (program.known_noc_groups && Array.isArray(program.known_noc_groups)) {
        program.known_noc_groups.forEach((nocCode) => {
          sourceLinks.push({
            programId: program.nid,
            nocCode: nocCode,
            isKnown: true,
          })
        })
      }
    })

    this.stats.programNocLinks.source = sourceLinks.length

    // Load database data
    const dbLinks = await prisma.programNocLink.findMany()
    this.stats.programNocLinks.db = dbLinks.length

    // Create lookup keys
    const sourceLinkKeys = new Set()
    const dbLinkKeys = new Set()

    sourceLinks.forEach((link) => {
      const key = `${link.programId}-${link.nocCode}`
      sourceLinkKeys.add(key)
    })

    dbLinks.forEach((link) => {
      const key = `${link.programId}-${link.nocCode}`
      dbLinkKeys.add(key)
    })

    // Count matches and differences
    for (const key of sourceLinkKeys) {
      if (dbLinkKeys.has(key)) {
        this.stats.programNocLinks.matches++
      } else {
        this.stats.programNocLinks.missing++
      }
    }

    for (const key of dbLinkKeys) {
      if (!sourceLinkKeys.has(key)) {
        this.stats.programNocLinks.extra++
      }
    }
  }

  /**
   * Generate comprehensive report
   */
  generateReport() {
    console.log('\n' + '='.repeat(80))
    console.log('📊 DATA INTEGRITY VALIDATION REPORT')
    console.log('='.repeat(80))

    const tables = [
      'programAreas',
      'programs',
      'nocUnitGroups',
      'nocSections',
      'economicRegions',
      'outlooks',
      'programNocLinks',
    ]

    tables.forEach((table) => {
      const stats = this.stats[table]
      const discrepancies = this.discrepancies[table]

      console.log(`\n🔍 ${table.toUpperCase()}:`)
      console.log(`   Source records: ${stats.source.toLocaleString()}`)
      console.log(`   Database records: ${stats.db.toLocaleString()}`)
      console.log(`   Matches: ${stats.matches.toLocaleString()}`)
      console.log(`   Missing from DB: ${stats.missing.toLocaleString()}`)
      console.log(`   Extra in DB: ${stats.extra.toLocaleString()}`)

      if (discrepancies.length > 0) {
        console.log(`   ⚠️  ${discrepancies.length} discrepancies found`)

        // Show first few examples
        const examples = discrepancies.slice(0, 3)
        examples.forEach((disc) => {
          const id = disc.nid || disc.nocCode || disc.code || disc.key
          console.log(`      ${disc.type}: ${id}`)
        })

        if (discrepancies.length > 3) {
          console.log(`      ... and ${discrepancies.length - 3} more`)
        }
      } else {
        console.log(`   ✅ No discrepancies found`)
      }
    })

    // Summary
    const totalDiscrepancies = Object.values(this.discrepancies).reduce(
      (sum, arr) => sum + arr.length,
      0
    )

    console.log('\n' + '='.repeat(80))
    if (totalDiscrepancies === 0) {
      console.log(
        '✅ DATA INTEGRITY CHECK PASSED - All data matches source files!'
      )
    } else {
      console.log(
        `⚠️  DATA INTEGRITY ISSUES FOUND - ${totalDiscrepancies} total discrepancies`
      )
      console.log('\n💡 Recommendations:')
      console.log('   1. Review the discrepancies above')
      console.log('   2. Run the seeder again to fix missing records')
      console.log('   3. Consider cleaning up extra records if needed')
    }
    console.log('='.repeat(80))
  }

  /**
   * Run complete validation
   */
  async validate() {
    console.log('🔍 Starting comprehensive data integrity validation...\n')

    try {
      await this.validateProgramAreas()
      await this.validatePrograms()
      await this.validateNocUnitGroups()
      await this.validateNocSections()
      await this.validateOutlooks()
      await this.validateProgramNocLinks()

      this.generateReport()
    } catch (error) {
      console.error('❌ Validation failed:', error.message)
      throw error
    } finally {
      await prisma.$disconnect()
    }
  }
}

// Run validation if called directly
if (require.main === module) {
  const validator = new DataValidator()
  validator.validate().catch(console.error)
}

module.exports = { DataValidator }
