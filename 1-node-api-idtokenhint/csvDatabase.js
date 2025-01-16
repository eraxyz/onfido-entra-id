const fs = require('fs');
const csvParser = require('csv-parser');
const { writeToPath } = require('fast-csv');

class CSVDatabase {
    constructor(filePath) {
      this.filePath = filePath;
    }
  
    readCSV(callback) {
      const results = [];
      fs.createReadStream(this.filePath)
        .pipe(csvParser())
        .on('data', (data) => results.push(data))
        .on('end', () => callback(results));
    }
  
    writeCSV(data) {
      writeToPath(this.filePath, data, { headers: true })
        .on('error', (err) => console.error(err))
        .on('finish', () => console.log('Write completed!'));
    }
  
    create(newRow) {
      this.readCSV((rows) => {
        const exists = rows.some((row) => row.applicant_id === newRow.applicant_id);
        if (exists) {
          console.log(`Row with id ${newRow.applicant_id} already exists.`);
          return;
        }
        rows.push(newRow);
        this.writeCSV(rows);
        console.log(`Row with id ${newRow.applicant_id} has been added.`);
      });
    }
  
    read(id, callback, notFoundCallback) {
      this.readCSV((rows) => {
        const result = rows.find((row) => row.applicant_id === id);
        result ? callback(result) : notFoundCallback()
      });
    }
  
    update(id, updatedData) {
      this.readCSV((rows) => {
        const index = rows.findIndex((row) => row.applicant_id === id);
        if (index !== -1) {
          rows[index] = { ...rows[index], ...updatedData };
          this.writeCSV(rows);
        }
      });
    }
  
    delete(id) {
      this.readCSV((rows) => {
        const filteredRows = rows.filter((row) => row.applicant_id !== id);
        this.writeCSV(filteredRows);
      });
    }
  }

  module.exports = CSVDatabase; 