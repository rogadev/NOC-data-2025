const express = require('express')
const { PrismaClient } = require('@prisma/client')
const xlsx = require('xlsx')
const fs = require('fs')
const path = require('path')

const prisma = new PrismaClient()
const app = express()
const PORT = process.env.PORT || 3000

// Batch Size for processing data (max 20 recommended)
const BATCH_SIZE = 20

// Seed Options
const SEED_OUTLOOKS = true
const SEED_PROGRAMS = true
const SEED_UNIT_GROUPS = true

// Log File Options
const LOG_ERRORS = false
const LOG_DUPLICATES = false

// Counters
let createdCount = 0
let duplicateCount = 0

// Write streams for logging
const errorLog = LOG_ERRORS
  ? fs.createWriteStream('errors.txt', { flags: 'a' })
  : null
const duplicateLog = LOG_DUPLICATES
  ? fs.createWriteStream('duplicates.txt', { flags: 'a' })
  : null

// Replaces previous line of progress with updated progress
function logProgress() {
  process.stdout.clearLine()
  process.stdout.cursorTo(0)
  process.stdout.write(
    `Created: ${createdCount} | Duplicates: ${duplicateCount}`
  )
}

/**
 * Attempts to create a record in the database while handling potential duplicates and errors
 * @param {PrismaClient[keyof PrismaClient]} model - The Prisma model to create the record in
 * @param {Object} data - The data to be inserted
 * @param {string} idLabel - Identifier label for logging purposes
 */
async function safeCreate(model, data, idLabel) {
  try {
    await model.create({ data })
    createdCount++
  } catch (error) {
    if (error.code === 'P2002') {
      duplicateCount++
      if (LOG_DUPLICATES && duplicateLog) {
        duplicateLog.write(`Duplicate on ${idLabel}: ${JSON.stringify(data)}\n`)
      }
    } else {
      if (LOG_ERRORS && errorLog) {
        errorLog.write(`Error on ${idLabel}: ${error.message}\n`)
      }
    }
  } finally {
    logProgress()
  }
}

/**
 * Safely deletes a record from the database with error handling
 * @param {PrismaClient[keyof PrismaClient]} model - The Prisma model to delete from
 * @param {Object} where - The where clause for identifying the record to delete
 * @param {string} label - Identifier label for logging purposes
 */
async function safeDelete(model, where, label) {
  try {
    await model.delete({ where })
  } catch (error) {
    if (LOG_ERRORS && errorLog) {
      errorLog.write(`Error deleting ${label}: ${error.message}\n`)
    }
  }
}

/**
 * Processes an array of data in chunks to prevent overwhelming the database
 * @param {Array} dataArray - Array of items to process
 * @param {Function} handler - Async function to process each item
 */
async function processInChunks(dataArray, handler) {
  for (let i = 0; i < dataArray.length; i += BATCH_SIZE) {
    const chunk = dataArray.slice(i, i + BATCH_SIZE)
    await Promise.all(chunk.map((item) => handler(item)))
  }
}

/**
 * Updates the console output to show delete operation progress
 * @param {number} deletedCount - Number of records deleted so far
 * @param {number} totalToDelete - Total number of records to delete
 */
function logDeleteProgress(deletedCount, totalToDelete) {
  const percent = Math.floor((deletedCount / totalToDelete) * 100)
  process.stdout.clearLine()
  process.stdout.cursorTo(0)
  process.stdout.write(
    `Deleting records: ${deletedCount}/${totalToDelete} (${percent}%)`
  )
}

/**
 * Main database seeding function that processes outlook data, VIU programs,
 * and unit groups based on configuration flags
 */
async function seedDatabase() {
  // 1) Process outlooks and region data
  if (SEED_OUTLOOKS) {
    console.log('\nSeeding Outlooks...')
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
  if (SEED_PROGRAMS) {
    console.log('\nSeeding Program Areas & Programs...')

    const programsFile = path.join(__dirname, 'data/viu_programs.json')

    if (fs.existsSync(programsFile)) {
      const programsData = JSON.parse(fs.readFileSync(programsFile, 'utf8'))

      // Extract unique program areas
      const programAreas = programsData.reduce((acc, program) => {
        const { nid, title } = program.program_area
        if (!acc.some((area) => area.nid === nid)) {
          acc.push({ nid, title })
        }
        return acc
      }, [])

      // Insert Program Areas
      await processInChunks(programAreas, async (area) => {
        await safeCreate(prisma.programArea, area, `ProgramArea: ${area.title}`)
      })

      // Fetch all Program Areas from DB to ensure they exist before inserting Programs
      const existingProgramAreas = await prisma.programArea.findMany()
      const programAreaMap = new Map(
        existingProgramAreas.map((pa) => [pa.nid, pa.id])
      )

      // Insert Programs
      await processInChunks(programsData, async (program) => {
        const programAreaNid = program.program_area.nid
        const foundProgramAreaId = programAreaMap.get(programAreaNid)

        if (!foundProgramAreaId) {
          console.error(
            `Missing Program Area for: ${program.title} (NID: ${programAreaNid})`
          )
          if (LOG_ERRORS && errorLog) {
            errorLog.write(
              `Missing Program Area for: ${program.title} (NID: ${programAreaNid})\n`
            )
          }
          return
        }

        await safeCreate(
          prisma.program,
          {
            nid: program.nid,
            title: program.title,
            duration: program.duration || null,
            credential: program.credential,
            programAreaNid: foundProgramAreaId, // Ensure FK relation exists
            viuSearchKeywords: program.viu_search_keywords || null,
            nocSearchKeywords: program.noc_search_keywords || [],
            knownNocGroups: program.known_noc_groups || [],
          },
          `Program: ${program.title}`
        )
      })

      console.log('\nFinished seeding Programs & Program Areas.')
    } else {
      console.log(`File not found: ${programsFile}`)
    }
  }

  // 3) Seed Unit Groups
  if (SEED_UNIT_GROUPS) {
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
  if (LOG_ERRORS && errorLog) {
    errorLog.end()
  }
  if (LOG_DUPLICATES && duplicateLog) {
    duplicateLog.end()
  }
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
    if (LOG_ERRORS && errorLog) {
      errorLog.write(`Error in /clean route: ${error.message}\n`)
    }
    console.error(error)
    return res.status(500).send('Error cleaning up short noc entries.')
  }
})

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
