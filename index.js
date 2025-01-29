const express = require('express')
const { PrismaClient } = require('@prisma/client')
const xlsx = require('xlsx')
const fs = require('fs')
const path = require('path')

const prisma = new PrismaClient()
const app = express()
const PORT = process.env.PORT || 3000

const BATCH_SIZE = 20

const includeOutlooks = false
const includePrograms = true
const includeUnitGroups = true

// Counters
let createdCount = 0
let duplicateCount = 0

// Write streams for logging
const errorLog = fs.createWriteStream('errors.txt', { flags: 'a' })
const duplicateLog = fs.createWriteStream('duplicates.txt', { flags: 'a' })

function logProgress() {
  process.stdout.clearLine()
  process.stdout.cursorTo(0)
  process.stdout.write(
    `Created: ${createdCount} | Duplicates: ${duplicateCount}`
  )
}

async function safeCreate(model, data, idLabel) {
  try {
    await model.create({ data })
    createdCount++
  } catch (error) {
    if (error.code === 'P2002') {
      duplicateCount++
      duplicateLog.write(`Duplicate on ${idLabel}: ${JSON.stringify(data)}\n`)
    } else {
      errorLog.write(`Error on ${idLabel}: ${error.message}\n`)
    }
  } finally {
    logProgress()
  }
}

// For deletes, we’ll track how many we’ve deleted in this route alone.
async function safeDelete(model, where, label) {
  try {
    await model.delete({ where })
  } catch (error) {
    errorLog.write(`Error deleting ${label}: ${error.message}\n`)
  }
}

// Helper to run any operation in chunks
async function processInChunks(dataArray, handler) {
  for (let i = 0; i < dataArray.length; i += BATCH_SIZE) {
    const chunk = dataArray.slice(i, i + BATCH_SIZE)
    await Promise.all(chunk.map((item) => handler(item)))
  }
}

// Logging progress for deletions
function logDeleteProgress(deletedCount, totalToDelete) {
  const percent = Math.floor((deletedCount / totalToDelete) * 100)
  process.stdout.clearLine()
  process.stdout.cursorTo(0)
  process.stdout.write(
    `Deleting records: ${deletedCount}/${totalToDelete} (${percent}%)`
  )
}

async function seedDatabase() {
  // 1) Process outlooks and region data
  if (includeOutlooks) {
    console.log('Seeding Outlooks...\n')
    const filePath = path.join(__dirname, 'data/2024-2026-3-year-outlooks.xlsx')
    const workbook = xlsx.readFile(filePath)
    const sheetName = workbook.SheetNames[0]
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName])

    await processInChunks(data, async (row) => {
      const noc = row['NOC_Code'].replace('NOC_', '').padStart(5, '0')
      const economicRegionCode = row['Economic Region Code'].toString()
      const economicRegionName = row['Economic Region Name']
      const title = row['NOC Title']
      const outlook = row['Outlook']
      const trends = row['Employment Trends']
      const releaseDate = new Date(row['Release Date'])
      const province = row['Province']
      const lang = row['LANG']

      await safeCreate(
        prisma.economicRegion,
        { economicRegionCode, economicRegionName },
        `economicRegionCode=${economicRegionCode}`
      )
      await safeCreate(
        prisma.unitGroup,
        { noc, occupation: title },
        `noc=${noc}`
      )
      await safeCreate(
        prisma.outlook,
        {
          noc,
          economicRegionCode,
          title,
          outlook,
          trends,
          releaseDate,
          province,
          lang,
        },
        `outlook=noc-${noc}-region-${economicRegionCode}`
      )
    })
  }

  // 2) Seed VIU programs
  if (includePrograms) {
    console.log('\nSeeding Programs...')
    const programsFile = path.join(__dirname, 'data/viu_programs.json')

    if (fs.existsSync(programsFile)) {
      const programsData = JSON.parse(fs.readFileSync(programsFile, 'utf8'))

      await processInChunks(programsData, async (p) => {
        // Create/ensure the program area
        const programAreaData = {
          nid: p.program_area.nid,
          title: p.program_area.title,
        }
        await safeCreate(
          prisma.programArea,
          programAreaData,
          `programAreaNid=${programAreaData.nid}`
        )

        // Create/ensure the program
        const programData = {
          nid: p.nid,
          title: p.title,
          duration: p.duration || null,
          credential: p.credential, // Must match the enum: Certificate, Diploma, Degree
          programAreaNid: p.program_area.nid,
          viuSearchKeywords: p.viu_search_keywords || null,
          nocSearchKeywords: p.noc_search_keywords || [],
          knownNocGroups: p.known_noc_groups || [],
        }
        await safeCreate(
          prisma.program,
          programData,
          `programNid=${programData.nid}`
        )
      })
    }
  }

  // 3) Seed Unit Groups
  if (includeUnitGroups) {
    console.log('\nSeeding Unit Groups...')
    const unitGroupsFile = path.join(__dirname, 'data/unit_groups.json')

    if (fs.existsSync(unitGroupsFile)) {
      const unitGroupsData = JSON.parse(fs.readFileSync(unitGroupsFile, 'utf8'))

      await processInChunks(unitGroupsData, async (unitGroup) => {
        const { noc_number, occupation, sections } = unitGroup

        // Insert UnitGroup
        await safeCreate(
          prisma.unitGroup,
          {
            noc: noc_number,
            occupation,
          },
          `noc=${noc_number}`
        )

        if (sections && sections.length > 0) {
          // Insert Sections related to the UnitGroup
          await processInChunks(sections, async (section) => {
            const { title, items } = section

            await safeCreate(
              prisma.sectionsEntity,
              {
                noc: noc_number,
                title,
                items: items || [], // Ensure items is an array
              },
              `sectionTitle=${title} for noc=${noc_number}`
            )
          })
        }
      })
    } else {
      console.log(`File not found: ${unitGroupsFile}`)
    }
  }

  console.log('\nSeeding complete!')
  console.log(`Total Created: ${createdCount}, Duplicates: ${duplicateCount}`)
  errorLog.end()
  duplicateLog.end()
  await prisma.$disconnect()
}

app.get('/seed', async (req, res) => {
  try {
    await seedDatabase()
    res.send('Database seeded successfully!')
  } catch (error) {
    console.error(error)
    res.status(500).send('Error seeding database')
  }
})

app.get('/clean', async (req, res) => {
  try {
    // 1) Fetch all Outlook records with short noc
    let outlookShortNoc = await prisma.outlook.findMany()
    outlookShortNoc = outlookShortNoc.filter((o) => o.noc.length < 5)

    // 2) Delete them in batches
    let deletedCount = 0
    const totalOutlook = outlookShortNoc.length
    await processInChunks(outlookShortNoc, async (o) => {
      await safeDelete(prisma.outlook, { id: o.id }, `Outlook ID=${o.id}`)
      deletedCount++
      logDeleteProgress(deletedCount, totalOutlook)
    })
    console.log('\nDone deleting Outlook records with short noc.')

    // 3) Fetch all UnitGroup records with short noc
    let unitGroupsShortNoc = await prisma.unitGroup.findMany()
    unitGroupsShortNoc = unitGroupsShortNoc.filter((u) => u.noc.length < 5)

    // 4) Delete them in batches
    deletedCount = 0
    const totalUnitGroups = unitGroupsShortNoc.length
    await processInChunks(unitGroupsShortNoc, async (u) => {
      await safeDelete(
        prisma.unitGroup,
        { noc: u.noc },
        `UnitGroup noc=${u.noc}`
      )
      deletedCount++
      logDeleteProgress(deletedCount, totalUnitGroups)
    })
    console.log('\nDone deleting UnitGroup records with short noc.')

    return res.send('Cleanup complete!')
  } catch (error) {
    errorLog.write(`Error in /clean route: ${error.message}\n`)
    console.error(error)
    return res.status(500).send('Error cleaning up short noc entries.')
  }
})

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
