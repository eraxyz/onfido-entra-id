var http = require('http');
var fs = require('fs');
var path = require('path');
var express = require('express')
var session = require('express-session')
var bodyParser = require('body-parser')
var base64url = require('base64url')
// mod.cjs
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
var secureRandom = require('secure-random');
const https = require('https')
const url = require('url')
const { Console } = require('console');
var uuid = require('uuid');
var mainApp = require('./app.js');
const CSVDatabase = require('./csvDatabase.js')
const {
    DefaultApi,
    Configuration,
    Region,
  } = require("@onfido/api");

var parser = bodyParser.urlencoded({ extended: false });

const onfidoApi = new DefaultApi(
  new Configuration({
    apiToken: process.env.ONFIDO_API_TOKEN,
    region: Region.EU, // Supports Region.EU, Region.US and Region.CA
    baseOptions: { timeout: 60_000 } // Additional Axios options (timeout, etc.)
  })
);

mainApp.app.post('/onfido-verification', parser, async (req, res) => {
    var body = '';
    req.on('data', function (data) {
      body += data;
    });
    req.on('end', function () {
      var results = JSON.parse(body.toString());
      console.log(results);
  
      const db = new CSVDatabase('data.csv');
  
      db.create({
        applicant_id: results?.payload?.resource?.applicant_id ?? "1",
        given_name: results?.payload?.resource?.output?.given_name ?? "Testing",
        family_name: results?.payload?.resource?.output?.family_name ?? "Last Name",
        status: results?.payload?.resource?.status ?? "approved",
        document_expiration: results?.payload?.resource?.output?.document_expiration ?? "2025-12-31",
        document_type: results?.payload?.resource?.output?.document_type ?? "Passport",
        document_number: results?.payload?.resource?.output?.document_number ?? "123456789",
        issuing_country: results?.payload?.resource?.output?.issuing_country ?? "USA"
      })
  
      res.sendStatus(200);
    })
  })

mainApp.app.get('/onfido-workflow', function (req, res) {
    onfidoApi.createApplicant({
      first_name: "Entra",
      last_name: "Testing"
    }).then(applicant => 
      onfidoApi.createWorkflowRun({
        applicant_id: applicant.data.id,
        workflow_id: process.env.ONFIDO_WORKFLOW_ID,
        link: {
          completed_redirect_url: `${process.env.NGROK_URL}/onfido-processing?ai=${applicant.data.id}`
        }
      })
    ).then(workflowResponse => {
      console.log(workflowResponse);
      return workflowResponse
    }).then((workflow) => {
      res.status(200).json({ redirectUrl: workflow?.data?.link?.url });
    }).catch(e => {
      console.log(e);
      console.log("Failed at workflow run creation")
    })
});

mainApp.app.get('/onfido-processing', function (req, res) {
  var ai = req.query.ai;
  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Retrieving Onfido Results...</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                margin: 20px;
            }
        </style>
    </head>
    <body>
        <h1 id="loading">Retrieving Onfido Results...</h1>
        

      <script>
        function getQueryParam(param) {
            const urlParams = new URLSearchParams(window.location.search);
            return urlParams.get(param);
        }

        async function fetchAndLoadHtml(ai) {
            const response = await fetch('/onfido-status?ai=${ai}');
            if (!response.ok) {
                throw new Error(\`HTTP error! Status: \${response.status}\`);
            }

            const htmlContent = await response.text();

            const isValidHtml = response.status != 204 && htmlContent.includes('<'); // Simple check for HTML tags
            return { isValidHtml, htmlContent };
        }

        async function startLoading() {
            const ai = getQueryParam('ai');
            if (!ai) {
                document.getElementById('loading').textContent =
                    "Missing 'ai' query parameter.";
                return;
            }

            const maxRetries = 120; // 1 retry per second for 60 seconds
            let attempts = 0;

            while (attempts < maxRetries) {
                try {
                    const { isValidHtml, htmlContent } = await fetchAndLoadHtml(ai);

                    if (isValidHtml) {
                        window.location = "issuer.html?ai=${ai}";
                        return;
                    }
                } catch (error) {
                    console.error(\`Attempt \${attempts + 1} failed:\`, error);
                }

                await new Promise((resolve) => setTimeout(resolve, 1000));
                attempts++;
            }

            document.getElementById('loading').textContent =
                "No results available after multiple attempts. Please try again later.";
        }

        startLoading();
        </script>
    </body>
    </html>
    `;

    res.send(htmlContent);
})

mainApp.app.get('/onfido-status', function (req, res) {
  var ai = req.query.ai;
  const db = new CSVDatabase('./data.csv');
  db.read(ai, () => {
    const filePath = path.join(__dirname, 'public/issuer.html');

    fs.readFile(filePath, 'utf8', (err, html) => {
      if (err) {
          console.error('Error reading file:', err);
          return res.status(500).send('Server error');
      }

      const modifiedHtml = html.replace(
          'const ai = "1";',
          `const ai = "${ai}";`
      );

      res.send(modifiedHtml);
  });
  }, () => res.sendStatus(204))
})