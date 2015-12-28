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
const nested = require("postcss-nested")
const cssnext = require("postcss-cssnext")
const rucksack = require("rucksack-css")
const csso = require("gulp-csso")
const persistify = require("persistify")
const envify = require("envify")
const babelify = require("babelify")
const uglify = require("gulp-uglify")
const rev = require("gulp-rev")
const revReplace = require("gulp-rev-replace")
const revNapkin = require("gulp-rev-napkin")
const replace = require("gulp-replace")
const gzip = require("gulp-gzip")
const optipng = require("imagemin-optipng")
const jpegoptim = require("imagemin-jpegoptim")
const size = require("gulp-size")

exports.cleanAssets = function cleanAssets() {
  return del("public/assets")
}

exports.bundleStyles = function bundleStyles(callback) {
  let streams = _.map(config.bundles, (entry) => {
    let extname = path.extname(entry)
    if (extname !== ".css") return
    const processors = [
      atImport({glob: true}),
      nested,
      cssnext(),
      rucksack()
    ]
    let stream = gulp.src(entry)
      .pipe(postcss(processors))
      .on("error", (err) => {
        util.log(err.toString())
        stream.emit("end")
      })
    if (process.env.NODE_ENV === "production") stream.pipe(csso(true))
    return stream.pipe(gulp.dest("public/assets/bundles"))
  })
  if (_.isEmpty(streams)) return callback()
  return merge(_.compact(streams))
}

exports.bundleScripts = function bundleScripts(callback) {
  const streams = _.map(config.bundles, (entry) => {
    const extname = path.extname(entry)
    const basename = path.basename(entry, extname)
    if ([".js"].indexOf(extname) < 0) return
    const bundler = persistify({entries: entry}, {cacheDir: "tmp/persistify"})
    bundler.transform(envify, {global: true})
    bundler.transform(babelify)
    const stream = bundler.bundle()
      .on("error", (err) => {
        util.log(util.colors.red("Browserify Error"), err.message)
        stream.emit("end")
      })
      .pipe(source(basename + extname))
      .pipe(buffer())
    if (process.env.NODE_ENV === "production") stream.pipe(uglify())
    return stream.pipe(gulp.dest("public/assets/bundles"))
  })
  if (_.isEmpty(streams)) return callback()
  return merge(_.compact(streams))
}

exports.copyFiles = function copyFiles(callback) {
  let streams = _.map(config.copies, (dest, src) => {
    return gulp.src(src).pipe(gulp.dest(dest))
  })
  if (_.isEmpty(streams)) return callback()
  return merge(streams)
}

exports.cdnAssets = function cdnAssets(callback) {
  if (process.env.NODE_ENV !== "production") return callback()
  if (process.env.ASSET_HOST == null) return callback()
  return gulp.src("public/assets/**/*")
    .pipe(replace(/\/assets\/((\w|\/|\-)*\.(css|js|jpg|jpeg|png|gif|swf))/ig,
      `${process.env.ASSET_HOST}/assets/$1`, {skipBinary: true})
    )
    .pipe(gulp.dest("public/assets"))
}

exports.revAssets = function revAssets(callback) {
  if (process.env.NODE_ENV !== "production") return callback()
  let stream = gulp.src("public/assets/**/*")
    .pipe(rev())
    .pipe(revReplace())
    .pipe(gulp.dest("public/assets"))
    .pipe(revNapkin({verbose: false}))
    .pipe(rev.manifest("manifest.json"))
    .pipe(gulp.dest("public/assets"))
  return stream
}

exports.compressAssets = function compressAssets(callback) {
  if (process.env.NODE_ENV !== "production") return callback()
  let gzipStream = gulp.src("public/assets/**/*.+(html|css|js|txt|md)")
    .pipe(gzip({level: 9}))
    .pipe(gulp.dest("public/assets"))
  let imageStream = gulp.src("public/assets/images/**/*")
    .pipe(optipng()())
    .pipe(jpegoptim({max: 60})())
    .pipe(gulp.dest("public/assets/images"))
  return merge(gzipStream, imageStream)
}

exports.sizeAssets = function sizeAssets() {
  return gulp.src("public/assets/**/*")
    .pipe(size({showFiles: true}))
}

exports.watchAssets = function watchAssets(callback) {
  gulp.watch(["assets/styles/**/*"], exports.bundleStyles)
  gulp.watch(["assets/scripts/**/*"], exports.bundleScripts)
  gulp.watch(_.keys(config.copies), exports.copyFiles)
  callback()
}
