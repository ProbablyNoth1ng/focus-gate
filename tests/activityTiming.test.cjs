const assert = require('node:assert/strict')
const test = require('node:test')

const { getActivityInterval } = require('../dist/electron/activityTiming.js')

test('keeps sampling drift in the recorded timeline while usage counters stay whole seconds', () => {
  assert.deepEqual(getActivityInterval(10_000, 12_151), {
    start_timestamp: 10_000,
    end_timestamp: 12_151,
    elapsed_seconds: 2,
  })
})
