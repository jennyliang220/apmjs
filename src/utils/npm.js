const registry = require('../registry.js')
const error = require('./error.js')
const log = require('npmlog')
const rp = require('request-promise')
const request = require('request')
const Promise = require('bluebird')
const debug = require('debug')('apmjs:npm')
const path = require('path')
const npm = require('npm')
const fs = require('fs-extra')
const tarball = require('tarball-extract')
const _ = require('lodash')

function downloadPackage (url, dir) {
  var name = path.basename(url)
  var tarfile = `/tmp/${name}.tgz`
  var untardir = `/tmp/${name}`
  var pkgdir = `${untardir}/package`
  // TODO: tarball cache
  log.verbose('downloading', url)
  return Promise.all([fs.remove(untardir), fs.remove(tarfile)])
    .then(() => new Promise((resolve, reject) => {
      var s = request({
        url: url,
        followRedirect: true
      })
      .on('response', res => {
        if (res.statusCode >= 400) {
          reject(new error.HTTP(res.statusCode))
        } else {
          s.on('error', reject)
          .pipe(fs.createWriteStream(tarfile))
          .on('finish', resolve)
        }
      })
    }))
    .then(() => Promise.fromCallback(
      cb => tarball.extractTarball(tarfile, untardir, cb)
    ))
    .then(() => fs.move(pkgdir, dir, {overwrite: true}))
}

var infoCache = {}

function getPackageInfo (name, parent) {
  if (infoCache[name]) {
    return infoCache[name]
  }
  var infoUrl = registry.packageUrl(name)
  log.verbose('retrieving info', infoUrl)
  infoCache[name] = rp({
    url: infoUrl,
    json: true
  })
  .promise()
  .catch(e => {
    if (e.statusCode === 404) {
      throw new error.PackageNotFound(name, parent)
    } else {
      throw e
    }
  })
  .tap(desc => {
    if (!_.has(desc, 'versions')) {
      throw new error.InvalidPackageInfo(name, parent)
    }
    var versionList = Object.keys(desc.versions).join(',')
    debug('package info retrieved:', `${desc.name}@${versionList}`)
  })
  return infoCache[name]
}

function load (conf) {
  var config = {}
  _.assign(config, conf)
  return Promise.fromCallback(cb => npm.load(config, cb))
}

module.exports = {downloadPackage, getPackageInfo, load}
