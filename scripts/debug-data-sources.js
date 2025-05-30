/**
 * Debug Data Sources Script
 * ========================
 *
 * Examines the structure of source data files to understand their format.
 */

const fs = require('fs')
const xlsx = require('node-xlsx')

console.log('🔍 Debugging data source structures...\n')

// Check VIU Programs structure
console.log('📊 VIU Programs (data/viu_programs.json):')
try {
  const viuPrograms = JSON.parse(
    fs.readFileSync('data/viu_programs.json', 'utf8')
  )
  console.log(`   Total programs: ${viuPrograms.length}`)

  if (viuPrograms.length > 0) {
    const firstProgram = viuPrograms[0]
    console.log('   First program structure:')
    console.log('   Keys:', Object.keys(firstProgram))
    console.log('   Sample:', {
      nid: firstProgram.nid,
      title: firstProgram.title,
      program_area: firstProgram.program_area,
      program_area_nid: firstProgram.program_area_nid,
      known_noc_groups: firstProgram.known_noc_groups,
    })
  }

  // Count unique program areas
  const programAreas = new Map()
  viuPrograms.forEach((program) => {
    if (program.program_area && program.program_area_nid) {
      programAreas.set(program.program_area_nid, program.program_area)
    }
  })
  console.log(`   Unique program areas: ${programAreas.size}`)
  console.log(
    '   Program areas:',
    Array.from(programAreas.entries()).slice(0, 3)
  )
} catch (error) {
  console.error('   ❌ Error reading VIU programs:', error.message)
}

// Check Unit Groups structure
console.log('\n📊 Unit Groups (data/unit_groups.json):')
try {
  const unitGroups = JSON.parse(
    fs.readFileSync('data/unit_groups.json', 'utf8')
  )
  console.log(`   Total unit groups: ${unitGroups.length}`)

  if (unitGroups.length > 0) {
    const firstGroup = unitGroups[0]
    console.log('   First unit group structure:')
    console.log('   Keys:', Object.keys(firstGroup))
    console.log('   Sample:', {
      noc: firstGroup.noc,
      occupation: firstGroup.occupation,
      sections: firstGroup.sections ? firstGroup.sections.length : 'none',
    })

    if (firstGroup.sections && firstGroup.sections.length > 0) {
      console.log('   First section:', {
        title: firstGroup.sections[0].title,
        items: firstGroup.sections[0].items
          ? firstGroup.sections[0].items.length
          : 'none',
      })
    }
  }
} catch (error) {
  console.error('   ❌ Error reading unit groups:', error.message)
}

// Check Outlooks Excel structure
console.log('\n📊 Outlooks Excel (data/2024-2026-3-year-outlooks.xlsx):')
try {
  const workbook = xlsx.parse('data/2024-2026-3-year-outlooks.xlsx')
  const rawData = workbook[0].data
  const headers = rawData[0]
  const outlookData = rawData.slice(1)

  console.log(`   Total rows (including header): ${rawData.length}`)
  console.log(`   Data rows: ${outlookData.length}`)
  console.log('   Headers:', headers)

  if (outlookData.length > 0) {
    const firstRow = outlookData[0]
    const obj = {}
    headers.forEach((header, index) => {
      obj[header] = firstRow[index]
    })
    console.log('   First row sample:', {
      NOC_Code: obj.NOC_Code,
      'NOC Title': obj['NOC Title'],
      'Economic Region Code': obj['Economic Region Code'],
      Province: obj.Province,
      Outlook: obj.Outlook,
    })
  }
} catch (error) {
  console.error('   ❌ Error reading outlooks Excel:', error.message)
}

console.log('\n✅ Data source structure analysis complete!')
