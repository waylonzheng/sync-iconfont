import fs from "fs"
import https from "https"
import path, { dirname } from "path"
import process from "process"
import readline from "readline"
import { fileURLToPath } from "url"
import Client from "ssh2-sftp-client"

import {
  DOMAIN, // 域名
  LOCAL_TEMP_DIRECTORY, // 本地临时目录
  REMOTE_DIRECTORY, // 上传目录
  REMOTE_SERVER_INFO // ssh配置
} from "./env.js"

let sftp = new Client()

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

const localFiles = [] // 需要上传到服务器的文件资源

// 下载文件到本地
function downloadFile(url, destination) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const file = fs.createWriteStream(destination)

      res.pipe(file)

      file.on("finish", () => {
        file.close(() => {
          console.log(
            `✅ File ${path.basename(destination)} downloaded successfully`
          )
          localFiles.push(destination)
          resolve()
        })
      })

      file.on("error", (err) => {
        fs.unlink(destination, () => {}) // 删除文件
        reject(
          `❌ Error occurred during ${path.basename(destination)} download: ${err}`
        )
      })
    })
  })
}

// 写入修改后的css文件并上传到服务器
function writeFileAndUpload(data) {
  return new Promise((resolve, reject) => {
    const cssFilePath = path.resolve(
      __dirname,
      `${LOCAL_TEMP_DIRECTORY}${globalFilename}.css`
    )
    fs.writeFile(cssFilePath, data, (err) => {
      if (err) {
        reject(`❌ Error occurred during writing CSS file: ${err}`)
      } else {
        console.log(`✅ CSS file written successfully`)
        localFiles.push(cssFilePath)
        resolve()
      }
    })
  })
    .then(() => {
      return sftp.connect(REMOTE_SERVER_INFO)
    })
    .then(() => {
      const uploadPromises = localFiles.map((localFilePath) => {
        const remoteFileName = path.basename(localFilePath)
        return sftp.put(localFilePath, REMOTE_DIRECTORY + remoteFileName)
      })

      return Promise.all(uploadPromises)
    })
    .then(() => {
      console.log("✅ Files uploaded successfully")
      return sftp.end()
    })
    .catch((err) => {
      console.error(err, "❌ Error occurred during upload")
      return sftp.end()
    })
}
let globalFilename = "iconfont"
rl.question("🔗 请输入下载的iconfont链接: ", (link) => {
  rl.question("📁 请输入保存的文件名: ", (name) => {
    globalFilename = name

    // 格式化url
    if (!link.startsWith("http:") && !link.startsWith("https:")) {
      link = "https:" + link
    }
    https.get(link, (response) => {
      let data = ""

      response.on("data", (chunk) => {
        data += chunk
      })

      response.on("end", () => {
        const urlRegex =
          /url\(['"]?([^'"\)]+)['"]?\) format\(['"]?([^'"\)]+)['"]?\)/g
        let match
        const downloadPromises = []
        while ((match = urlRegex.exec(data)) !== null) {
          let url = match[1].replace(/\?t=\d+$/, "") // 去除参数部分
          const extension = path.extname(url)
          const filename = `${globalFilename}${extension}`
          const destination = path.resolve(
            __dirname,
            `${LOCAL_TEMP_DIRECTORY}${filename}`
          )

          // 校验url是否为base64 （彩色icon url为base64）
          if (!url.startsWith("data:")) {
            data = data.replace(
              match[1],
              `${DOMAIN}${REMOTE_DIRECTORY}${filename}`
            )
            if (!url.startsWith("http:") && !url.startsWith("https:")) {
              url = "https:" + url
            }
            downloadPromises.push(downloadFile(url, destination))
          }
        }

        Promise.all(downloadPromises)
          .then(() => {
            return writeFileAndUpload(data)
          })
          .then(() => {
            rl.close()
          })
          .catch((err) => {
            console.error(err)
            rl.close()
          })
      })
    })
    rl.close()
  })
})
