"use strict"

const config = require(`${process.cwd()}/assets/config`)
const _ = require("lodash")
const fs = require("fs")
const path = require("path")
const merge = require("merge-stream")
const source = require("vinyl-source-stream")
const buffer = require("vinyl-buffer")
const del = require("del")
const gulp = require("gulp")
const util = require("gulp-util")
const filter = require("gulp-filter")
const postcss = require("gulp-postcss")
const atImport = require("postcss-import")
const cssnext = require("postcss-cssnext")
const rucksack = require("rucksack-css")
const csso = require("gulp-csso")
const browserifyInc = require("browserify-incremental")
const envify = require("envify")
const babelify = require("babelify")
const uglifyify = require("uglifyify")
const rev = require("gulp-rev")
const revReplace = require("gulp-rev-replace")
const revNapkin = require("gulp-rev-napkin")
const replace = require("gulp-replace")
const gzip = require("gulp-gzip")
const optipng = require("imagemin-optipng")
const jpegoptim = require("imagemin-jpegoptim")
const size = require("gulp-size")
const browserSync = require("browser-sync")
const minifyify = require('minifyify')

const NODE_ENV = _.get(process, "env.NODE_ENV", "development")
const ASSET_HOST = _.get(process, "env.ASSET_HOST")
const PORT = _.get(process, "env.PORT", 8080)

function cleanAssets() {
  return del("public/assets")
}

function bundleStyles(callback) {
  let streams = _.map(config.bundles, (entry) => {
    let extname = path.extname(entry)
    if (extname !== ".css") return
    const processors = [
      atImport({glob: true}),
      cssnext(),
      rucksack()
    ]
    let stream = gulp.src(entry)
      .pipe(postcss(processors))
      .on("error", (err) => {
        util.log(err.toString())
        stream.emit("end")
      })
    if (NODE_ENV === "production") {
      stream.pipe(csso(true))
    }
    return stream.pipe(gulp.dest("public/assets/bundles"))
  })
  if (_.isEmpty(streams)) return callback()
  return merge(_.compact(streams))
}

function bundleScripts(callback) {
  const streams = _.map(config.bundles, (entry) => {
    const extname = path.extname(entry)
    const basename = path.basename(entry, extname)
    if ([".js"].indexOf(extname) < 0) return
    const bundler = browserifyInc({
      entries: entry,
      cacheFile: "./tmp/browserify_cache.json",
      debug: true
    })
    bundler.transform(envify, {global: true})
    bundler.transform(babelify)
    if (NODE_ENV === "production") {
      bundler.transform(uglifyify, {global: true})
      bundler.plugin('minifyify', {map: 'map.json', output: 'public/assets/bundles/map.json'})
    }
    const stream = bundler.bundle()
      .on("error", (err) => {
        util.log(util.colors.red("Browserify Error"), err.message)
        stream.emit("end")
      })
      .pipe(source(basename + extname))
      .pipe(buffer())
      .pipe(gulp.dest("public/assets/bundles"))
    return stream
  })
  if (_.isEmpty(streams)) return callback()
  return merge(_.compact(streams))
}

function copyFiles(callback) {
  let streams = _.map(config.copies, (dest, src) => {
    return gulp.src(src).pipe(gulp.dest(dest))
  })
  if (_.isEmpty(streams)) return callback()
  return merge(streams)
}

function cdnAssets(callback) {
  if (NODE_ENV !== "production") return callback()
  if (ASSET_HOST == null) return callback()
  return gulp.src("public/assets/**/*")
    .pipe(replace(/\/assets\/((\w|\/|\-)*\.(css|js|jpg|jpeg|png|gif|swf))/ig,
      `${ASSET_HOST}/assets/$1`, {skipBinary: true})
    )
    .pipe(gulp.dest("public/assets"))
}

function revAssets(callback) {
  if (NODE_ENV !== "production") return callback()
  let stream = gulp.src("public/assets/**/*")
    .pipe(rev())
    .pipe(revReplace())
    .pipe(gulp.dest("public/assets"))
    .pipe(revNapkin({verbose: false}))
    .pipe(rev.manifest("manifest.json"))
    .pipe(gulp.dest("public/assets"))
  return stream
}

function compressAssets(callback) {
  if (NODE_ENV !== "production") return callback()
  let gzipStream = gulp.src("public/assets/**/*.+(html|css|js|txt|md)")
    .pipe(gzip({level: 9}))
    .pipe(gulp.dest("public/assets"))
  let imageStream = gulp.src("public/assets/images/**/*")
    .pipe(optipng()())
    .pipe(jpegoptim({max: 60})())
    .pipe(gulp.dest("public/assets/images"))
  return merge(gzipStream, imageStream)
}

function sizeAssets() {
  return gulp.src("public/assets/**/*")
    .pipe(size({showFiles: true}))
}

function startBrowserSync(callback) {
  browserSync({}, callback)
}

function reloadBrowserSync(callback) {
  browserSync.reload()
  callback()
}

exports.watchAssets = function watchAssets(callback) {
  gulp.watch(["assets/styles/**/*"],
    gulp.series(bundleStyles, reloadBrowserSync)
  )
  gulp.watch(["assets/scripts/**/*"],
    gulp.series(bundleScripts, reloadBrowserSync)
  )
  gulp.watch(_.keys(config.copies),
    gulp.series(copyFiles, reloadBrowserSync)
  )
  callback()
}

exports.cleanAssets = cleanAssets
exports.bundleStyles = bundleStyles
exports.bundleScripts = bundleScripts
exports.copyFiles = copyFiles
exports.cdnAssets = cdnAssets
exports.revAssets = revAssets
exports.compressAssets = compressAssets
exports.sizeAssets = sizeAssets
exports.startBrowserSync = startBrowserSync