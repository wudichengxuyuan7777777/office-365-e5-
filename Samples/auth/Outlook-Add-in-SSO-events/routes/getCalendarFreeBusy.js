// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

const express = require("express");
var router = express.Router();
const authHelper = require("../server-helpers/obo-auth-helper");
const getGraphData = require("../server-helpers/msgraph-helper");
const jwt = require("jsonwebtoken");

router.get(
  "/getCalendarFreeBusy",
  authHelper.validateJwt,
  async function (req, res) {
    try {
      const authHeader = req.headers.authorization;
      let oboRequest = {
        oboAssertion: authHeader.split(" ")[1],
        scopes: ["calendars.read"],
      };

      const sendBody = {        
        "schedules": ["davech@davechuatest3.onmicrosoft.com"],
        "startTime": {
            "dateTime": "2019-03-15T09:00:00",
            "timeZone": "Pacific Standard Time"
        },
        "endTime": {
            "dateTime": "2019-03-15T18:00:00",
            "timeZone": "Pacific Standard Time"
        },
        "availabilityViewInterval": 60
      };
      

      // The Scope claim tells you what permissions the client application has in the service.
      // In this case we look for a scope value of access_as_user, or full access to the service as the user.
      const tokenScopes = jwt.decode(oboRequest.oboAssertion).scp.split(" ");
      const accessAsUserScope = tokenScopes.find(
        (scope) => scope === "access_as_user"
      );
      if (!accessAsUserScope) {
        res.status(401).send({ type: "Missing access_as_user" });
        return;
      }
      const cca = authHelper.getConfidentialClientApplication();
      const response = await cca.acquireTokenOnBehalfOf(oboRequest);
      // Minimize the data that must come from MS Graph by specifying only the property we need ("name")
      // and only the top 10 folder or file names.
      //const rootUrl = "/me/drive/root/children";
      const rootUrl = "/me/calendar/getSchedule";

      // Note that the last parameter, for queryParamsSegment, is hardcoded. If you reuse this code in
      // a production add-in and any part of queryParamsSegment comes from user input, be sure that it is
      // sanitized so that it cannot be used in a Response header injection attack.
      const params = "";

      const graphData = await getGraphData(
        response.accessToken,
        rootUrl,
        params,
        sendBody
      );

      // If Microsoft Graph returns an error, such as invalid or expired token,
      // there will be a code property in the returned object set to a HTTP status (e.g. 401).
      // Return it to the client. On client side it will get handled in the fail callback of `makeWebServerApiCall`.
      if (graphData.code) {
        res
          .status(403)
          .send({
            type: "Microsoft Graph",
            errorDetails:
              "An error occurred while calling the Microsoft Graph API.\n" +
              graphData,
          });
      } else {
        // MS Graph data includes OData metadata and eTags that we don't need.
        // Send only what is actually needed to the client: the item names.
        const workingDays = [];
        const value = graphData["value"];
        const workingHours = value[0].workingHours;
        let returnString = "I work on ";
        for (let item of workingHours.daysOfWeek) {
          returnString += item + " ";
        }

        returnString += ". My hours are from " + workingHours.startTime;
        returnString += " to " + workingHours.endTime;
        returnString += " in the " + workingHours.timeZone.name + ".";

        res.status(200).send(returnString);
      }
    } catch (err) {
      // On rare occasions the SSO access token is unexpired when Office validates it,
      // but expires by the time it is used in the OBO flow. Microsoft identity platform will respond
      // with "The provided value for the 'assertion' is not valid. The assertion has expired."
      // Construct an error message to return to the client so it can refresh the SSO token.
      if (err.errorMessage.indexOf("AADSTS500133") !== -1) {
        res.status(401).send({ type: "TokenExpiredError", errorDetails: err });
      } else {
        res.status(403).send({ type: "Unknown", errorDetails: err });
      }
    }
  }
);

module.exports = router;
