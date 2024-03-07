# filepick-api


## Installation
Instructions on how to install the project, including any dependencies.

- npm install
- API can be accessed in localhost:3001


## Usage

- (GET) /files - Parameter : None
It will return all the files saved in the server, unless the server is restarted the files will remain in memory

- (GET) /downloads - Parameter : None
It will return all files wrapped in a zip file.

- (POST) /upload - Body : Zip file
It accepts a zip file and will loop through it save it in server memory, And returns the list of files.

- (POST) /rename - Body : Old filename, New Filename
It accepts old and new filename

- (POST) /copy - Body: Filename
It accepts a filename to be copied, and will duplicated in server.

- (POST) /pause - Body: None
It pauses a copy process, it does not need a body since it relies on the /copy filename.

- (POST) /resume - Body: None
It resumes a copy process, it does not need a body since it relies on the /copy filename.
