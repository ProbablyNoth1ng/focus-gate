const fs = require('fs')
const path = require('path')

const indexPath = path.join(__dirname, '../dist/renderer/index.html')
const html = fs.readFileSync(indexPath, 'utf-8')

const fixed = html
  .replace(/ crossorigin/g, '')
  .replace(/<script type="module"/g, '<script defer')

fs.writeFileSync(indexPath, fixed)
console.log('Fixed index.html:\n' + fixed)