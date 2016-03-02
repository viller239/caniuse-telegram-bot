'use strict'

process.on('unhandledRejection', (reason, p) => {
  console.error(p)
})

const isProd = process.env.NODE_ENV === 'production'
const TelegramBot = require('node-telegram-bot-api')
const _ = require('lodash')
const db = require('caniuse-db/data.json')

const inlineQueryCacheTime = isProd ? 3600 : 20

const digits = '⁰¹²³⁴⁵⁶⁷⁸⁹'
const icons = {
  y: '✔',
  n: '✘',
  a: '◒',
  i: 'ⓘ'
}

const normalizeStr = (str) => _.isString(str)
  ? str.replace(/\s|-|\./g, '').toLowerCase()
  : ''

const makeFeaureURL = (name) => `http://caniuse.com/#feat=${name}`

const makeSupportStr = (stat, browser) => `*${browser.browser}*  ` +
  _.reduce(browser.versions, (result, version) => {
    let support = stat[version]
    if (support) {
      support = support.replace(/p|u|d/g, 'n')
      const last = _.last(result)
      if (!last || last.support !== support) {
        result.push({support, version})
      } else if (last && last.support === support) {
        last.plus = true
      }
    }
    return result
  }, []).map((pivot) => {
    let str = icons[pivot.support[0]]
    if (pivot.support.includes('x')) {
      str += 'ᵖ'
    }
    str += ' ' + pivot.version
    if (pivot.plus) {
      str += '+'
    }
    if (pivot.support.includes('#')) {
      str += pivot.support.match(/#\d/g).map((match) => digits[match[1]]).join('')
    }
    return str
  }).join('   ')

const makeFeatureMessage = (feature) => {
  let str = `[${feature.title}](${feature._url}) [[${feature._status}]]`
  if (feature.description) {
    str += `\n${feature.description.trim()}`
  }
  str += '\n\n' + feature._desktopSupport.join('\n')
  str += '\n\n' + feature._mobileSupport.join('\n')
  if (feature._notes) {
    str += `\n\n${feature._notes}`
  }
  if (feature.notes) {
    str += `\n\n${icons.i} ${feature.notes}`
  }
  return str
}

const searchFeature = (query, features) => {
  const inTitle = []
  const inDescription = []
  const inKeywords = []
  _.forEach(features, (feature) => {
    const tIndex = feature._nTitle.indexOf(query)
    if (tIndex > -1) {
      return inTitle.push([tIndex, feature])
    }
    const dIndex = feature._nDescription.indexOf(query)
    if (dIndex > -1) {
      return inDescription.push([dIndex, feature])
    }
    const kIndex = feature._nKeywords.indexOf(query)
    if (kIndex > -1) {
      return inKeywords.push([kIndex, feature])
    }
  })
  return _.flatten([inTitle, inDescription, inKeywords]
    .map((arr) => arr.sort((a, b) => a[0] - b[0]).map((a) => a[1])))
}

const startBot = (token) => {
  const bot = new TelegramBot(token, {
    polling: true
  })

  bot.on('inline_query', (inlineQuery) => {
    const query = normalizeStr(inlineQuery.query)
    if (query.length < 3) {
      return
    }

    const result = searchFeature(query, db.data).splice(0, 50)
    bot.answerInlineQuery(inlineQuery.id, result.map((feature) => ({
      id: feature._key,
      type: 'article',
      title: feature.title,
      url: feature._url,
      parse_mode: 'Markdown',
      message_text: feature._text,
      description: feature._usage,
      disable_web_page_preview: true
    })), {
      cache_time: inlineQueryCacheTime
    })
  })

  bot.onText(/\/caniuse (.+)/, (msg, match) => {
    const firstResult = searchFeature(normalizeStr(match[1]), db.data)[0]
    if (firstResult) {
      bot.sendMessage(msg.from.id, firstResult._text, {
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      })
    }
  })
}

_.forEach(db.data, (f, key) => {
  f._key = key
  f._url = makeFeaureURL(key)
  f._nTitle = normalizeStr(f.title)
  f._nDescription = normalizeStr(f.description)
  f._nKeywords = normalizeStr(f.keywords)
  f._usage = `${icons.y} ${f.usage_perc_y.toFixed(2)}% ${icons.a} ${f.usage_perc_a.toFixed(2)}%`
  f._notes = _.map(f.notes_by_num, (note, key) => `${digits[key]} ${note}`).join('\n')
  f._status = db.statuses[f.status]
  f._desktopSupport = _.compact(_.map(f.stats, (stat, browserId) => {
    const browser = db.agents[browserId]
    return browser.type === 'desktop' && makeSupportStr(stat, browser)
  }))
  f._mobileSupport = _.compact(_.map(f.stats, (stat, browserId) => {
    const browser = db.agents[browserId]
    return browser.type === 'mobile' && makeSupportStr(stat, browser)
  }))
  f._text = makeFeatureMessage(f)
})

if (process.env.TOKEN) {
  console.log('starting bot')
  startBot(process.env.TOKEN)
}
