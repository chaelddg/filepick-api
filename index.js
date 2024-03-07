const express = require('express');
const multer = require('multer');
const unzipper = require('unzipper');
const fs = require('fs');
const path = require('path');
const cors = require('cors')
const bodyParser = require('body-parser')
const http = require('http');
const archiver = require('archiver');
const socketIo = require('socket.io');

const app = express();

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*'
  }
});

app.use(cors());

app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())

app.use(express.static('extracted'));

io.on('connection', (socket) => {
  console.log('A client connected');

  socket.on('message', (data) => {
    console.log('Received message:', data);
    io.emit('message', data);
  });

  socket.on('disconnect', () => {
    console.log('A client disconnected');
  });
});

let totalFileSize = 0;
let copiedFileSize = 0;
let copyingPaused = false;
let originalFile = '';
let toBeCopiedFile = '';

let readStream = null;
let writeStream = null

const upload = multer({
  storage: multer.memoryStorage(),
});

async function createUniqueFilename(filename) {
  let newFilename = filename;
  let i = 1;

  while (fs.existsSync(newFilename)) {
    const [name, extension] = filename.split('.');
    newFilename = `${name}(${i}).${extension}`;
    i++;
  }

  return newFilename;
}

async function getFiles(res) {
  const extractedPath = path.join(__dirname, 'extracted');
  
  if (!fs.existsSync(extractedPath)) {
    fs.mkdirSync(extractedPath);
  }

  // clear unfinished copy files
  if (originalFile && toBeCopiedFile) {
    await removeIncompleteFiles(originalFile, toBeCopiedFile)
    originalFile = "";
    toBeCopiedFile = "";
  }

  fs.readdir(extractedPath, (err, files) => {
    if (err) {
      return res.status(500).send('Error reading extracted files.');
    }
    res.send(files);
  });
}

async function removeIncompleteFiles(sourcePath, destinationPath) {
  try {
    const sourceStats = fs.statSync(sourcePath);
    const destinationStats = fs.statSync(destinationPath);

    if (sourceStats.size !== destinationStats.size) {
      fs.unlinkSync(destinationPath);
      console.log(`Removed incomplete file: ${destinationPath}`);
    } else {
      console.log(`File copy completed successfully: ${destinationPath}`);
    }
  } catch (err) {
    console.error('Error removing incomplete files:', err);
  }
}


app.get('/files', async (req, res) => {
  return getFiles(res);
})

app.get('/download', async (req, res) => {
  const folderPath = 'extracted'; // Provide the path to the folder you want to download

  const zipFileName = 'download.zip';
  const zipFilePath = path.join(__dirname, zipFileName);

  const archive = archiver('zip', { zlib: { level: 9 } });

  const output = fs.createWriteStream(zipFilePath);
  output.on('close', () => {
    res.download(zipFilePath, zipFileName, (err) => {
      if (err) {
        console.error('Error downloading zip file:', err);
        res.status(500).send('Error downloading zip file.');
      } else {
        fs.unlinkSync(zipFilePath); // Delete the zip file after downloading
      }
    });
  });

  archive.pipe(output);
  archive.directory(folderPath, false); // Add the folder and its contents to the zip file
  archive.finalize();
})

app.post('/upload', upload.single('zipFile'), (req, res) => {
  console.log('req file', req.file)
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }

  if (req.file.mimetype !== 'application/zip') {
    return res.status(400).send('Only zip files are allowed.');
  }

  const zipFile = req.file.buffer;
  const extractedPath = path.join(__dirname, 'extracted');

  if (!fs.existsSync(extractedPath)) {
    fs.mkdirSync(extractedPath);
  }

  // Extract files from the zip
  fs.writeFileSync('temp.zip', zipFile);
  fs.createReadStream('temp.zip')
    .pipe(unzipper.Extract({ path: extractedPath }))
    .on('close', () => {
      fs.unlinkSync('temp.zip'); // Remove the temporary zip file
      // Loop through the extracted files
      fs.readdir(extractedPath, (err, files) => {
        if (err) {
          return res.status(500).send('Error reading extracted files.');
        }
        // Send the list of extracted files as response
        res.send(files);
      });
    });
});

app.post('/rename', (req, res) => {
  const extractedPath = path.join(__dirname, 'extracted');
  const prevName = `${extractedPath}/${req.body.old_name}`
  const newName = `${extractedPath}/${req.body.new_name}`
  fs.rename(prevName, newName, (err) => {
    if (err) {
      console.error('Error renaming file:', err);
      res.send({ message: 'Error renaming file' });
    } else {
      res.send({ message: 'File renamed successfully' });
    }
  });
});

app.post('/copy', async (req, res) => {
  const extractedPath = path.join(__dirname, 'extracted');
  originalFile = `${extractedPath}/${req.body.filename}`
  toBeCopiedFile = await createUniqueFilename(originalFile)
  totalFileSize = fs.statSync(originalFile).size;
  copiedFileSize = 0;
  copyingPaused = false;

  readStream = fs.createReadStream(originalFile);
  writeStream = fs.createWriteStream(toBeCopiedFile);

  readStream.on('data', (chunk) => {
    if (copyingPaused) {
      readStream.pause();
      return;
    }
    copiedFileSize += chunk.length;
    let progress = Math.round((copiedFileSize / totalFileSize) * 100);
    io.emit('file_change', progress);
    writeStream.write(chunk);
  });

  readStream.on('end', () => {
    originalFile = "";
    toBeCopiedFile = "";
    writeStream.end(() => {
      return getFiles(res);
    });
  });

  readStream.on('error', (err) => {
    res.status(500).send(err.message);
  });

});

app.post('/pause', (req, res) => {
  copyingPaused = true;
  res.sendStatus(200);
});

app.post('/resume', (req, res) => {
  copyingPaused = false;
  readStream.resume();
  res.send(200)
});

// Start the server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});