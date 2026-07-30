const assert = require('node:assert/strict')
const test = require('node:test')

const { ApplicationSessionRegistry } = require('../dist/electron/applicationSessionRegistry.js')

function createRegistry(initialLivePids = []) {
  const livePids = new Set(initialLivePids)
  const events = []
  const registry = new ApplicationSessionRegistry(
    (pid) => livePids.has(pid),
    (message) => events.push(message)
  )

  return { registry, livePids, events }
}

test('keeps one executable session active while any tracked PID is alive', () => {
  const { registry, livePids } = createRegistry([101, 102, 103])
  registry.startSession('C:\\Apps\\Telegram.exe', [101, 102], 'approved')

  assert.equal(registry.claimIfActive('telegram.exe', 103), 'approved')

  livePids.delete(101)
  livePids.delete(102)
  registry.pruneAll()

  assert.equal(registry.claimIfActive('TELEGRAM', 103), 'approved')
})

test('ends a session when all tracked PIDs exit and rejects the next launch', () => {
  const { registry, livePids, events } = createRegistry([201, 202])
  registry.startSession('discord.exe', [201, 202], 'approved')

  livePids.delete(201)
  livePids.delete(202)
  livePids.add(203)

  assert.equal(registry.claimIfActive('discord.exe', 203), null)
  assert.ok(events.some((event) => event.includes('[APP SESSION CLOSED] exe=discord.exe')))
})

test('tracks pre-existing sessions across additional same-executable PIDs', () => {
  const { registry, livePids } = createRegistry([301, 302])
  registry.startSession('C:\\Apps\\Example.exe', [301], 'pre-existing')

  assert.equal(registry.claimIfActive('example.exe', 302), 'pre-existing')

  livePids.delete(301)
  registry.pruneAll()
  assert.equal(registry.claimIfActive('example.exe', 302), 'pre-existing')
})

test('keeps executable sessions independent', () => {
  const { registry } = createRegistry([401, 402, 403])
  registry.startSession('telegram.exe', [401], 'approved')
  registry.startSession('discord.exe', [402], 'pre-existing')

  assert.equal(registry.claimIfActive('telegram.exe', 403), 'approved')
  assert.equal(registry.claimIfActive('discord.exe', 402), 'pre-existing')
  assert.equal(registry.claimIfActive('chrome.exe', 403), null)
})

test('process-start events invalidate reused PIDs in pre-existing sessions', () => {
  const { registry } = createRegistry([501])
  registry.startSession('example.exe', [501], 'pre-existing')

  registry.recordProcessStart(501)

  assert.equal(registry.claimIfActive('example.exe', 501), null)
})

test('process-start events preserve a newly registered approved relaunch PID', () => {
  const { registry } = createRegistry([601])
  registry.startSession('example.exe', [601], 'approved')

  registry.recordProcessStart(601)

  assert.equal(registry.claimIfActive('example.exe', 601), 'approved')
})
