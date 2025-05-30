/**
 * Debug Program-NOC Links Issue
 * =============================
 *
 * Investigates why Program-NOC Links are failing due to foreign key constraints.
 */

const fs = require('fs')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function debugProgramLinks() {
  console.log('🔍 Debugging Program-NOC Links foreign key issue...\n')

  try {
    // Load VIU programs data
    console.log('📖 Loading VIU programs data...')
    const viuPrograms = JSON.parse(
      fs.readFileSync('data/viu_programs.json', 'utf8')
    )

    // Extract Program IDs that have NOC links
    const programsWithNocLinks = new Set()
    const allNocLinks = []

    viuPrograms.forEach((program) => {
      if (program.known_noc_groups && Array.isArray(program.known_noc_groups)) {
        programsWithNocLinks.add(program.nid)
        program.known_noc_groups.forEach((nocCode) => {
          allNocLinks.push({
            programId: program.nid,
            nocCode: nocCode,
          })
        })
      }
    })

    console.log(`📊 Programs with NOC links: ${programsWithNocLinks.size}`)
    console.log(`📊 Total NOC links: ${allNocLinks.length}`)

    // Get all Program IDs from database
    console.log('\n📊 Checking database Programs...')
    const dbPrograms = await prisma.program.findMany({
      select: { nid: true, title: true },
    })

    const dbProgramIds = new Set(dbPrograms.map((p) => p.nid))
    console.log(`📊 Programs in database: ${dbPrograms.length}`)

    // Find missing Program IDs
    const missingProgramIds = []
    for (const programId of programsWithNocLinks) {
      if (!dbProgramIds.has(programId)) {
        missingProgramIds.push(programId)
      }
    }

    console.log(`\n❌ Missing Program IDs: ${missingProgramIds.length}`)
    if (missingProgramIds.length > 0) {
      console.log('Missing IDs:', missingProgramIds.slice(0, 10))
      if (missingProgramIds.length > 10) {
        console.log(`... and ${missingProgramIds.length - 10} more`)
      }
    }

    // Show some examples of programs that exist vs. don't exist
    console.log('\n📋 Sample comparison:')
    console.log('Programs that exist in DB:')
    dbPrograms.slice(0, 5).forEach((p) => {
      console.log(`   ${p.nid}: ${p.title}`)
    })

    console.log('\nPrograms referenced in NOC links:')
    const referencedPrograms = viuPrograms
      .filter((p) => p.known_noc_groups && p.known_noc_groups.length > 0)
      .slice(0, 5)

    referencedPrograms.forEach((p) => {
      const exists = dbProgramIds.has(p.nid) ? '✅' : '❌'
      console.log(`   ${exists} ${p.nid}: ${p.title}`)
    })

    // Check NOC codes validity
    console.log('\n🔍 Checking NOC codes validity...')
    const dbNocCodes = await prisma.nocUnitGroup.findMany({
      select: { nocCode: true },
    })
    const dbNocCodesSet = new Set(dbNocCodes.map((n) => n.nocCode))

    const invalidNocCodes = []
    allNocLinks.forEach((link) => {
      if (!dbNocCodesSet.has(link.nocCode)) {
        invalidNocCodes.push(link.nocCode)
      }
    })

    const uniqueInvalidNocCodes = [...new Set(invalidNocCodes)]
    console.log(`❌ Invalid NOC codes: ${uniqueInvalidNocCodes.length}`)
    if (uniqueInvalidNocCodes.length > 0) {
      console.log('Invalid NOC codes:', uniqueInvalidNocCodes.slice(0, 10))
    }

    // Summary
    console.log('\n' + '='.repeat(60))
    console.log('📊 SUMMARY:')
    console.log(`   Total programs in VIU data: ${viuPrograms.length}`)
    console.log(`   Programs in database: ${dbPrograms.length}`)
    console.log(`   Programs with NOC links: ${programsWithNocLinks.size}`)
    console.log(`   Missing Program IDs: ${missingProgramIds.length}`)
    console.log(`   Invalid NOC codes: ${uniqueInvalidNocCodes.length}`)
    console.log('='.repeat(60))

    if (missingProgramIds.length > 0) {
      console.log(
        "\n💡 ISSUE: Some programs referenced in NOC links don't exist in the database."
      )
      console.log(
        '   This suggests the Programs table may be missing some records.'
      )
      console.log(
        '   You may need to re-run the programs seeder or check the source data.'
      )
    }
  } catch (error) {
    console.error('❌ Error:', error.message)
  } finally {
    await prisma.$disconnect()
  }
}

debugProgramLinks()
