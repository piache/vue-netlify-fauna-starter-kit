/*
Generates a new account in faunaDB based on the unique user ID 
along with some supplementry user_metadata

This function will only work if invoked with a POST request along with
the body containing an object 

{ 
  user:{
    id: 'test-id',
    user_metadata: { 
      full_name: 'user name' 
    }
  }
}
*/

"use strict";
const fetch = require("node-fetch");
const faunadb = require("faunadb");
const generator = require('generate-password');

/* configure faunaDB Client with our secret 
   DB Secret key is held within the netlify online UI
*/
const q = faunadb.query
const client = new faunadb.Client({
  secret: process.env.FAUNADB_SERVER_SECRET
})

/* create a user in FaunaDB that can connect from the browser */
function createUser(userData, password) {
  return client.query(q.Create(q.Collection("users"), {
    credentials : {
      password : password
    },
    data : {
      id : userData.id,
      user_metadata : userData.user_metadata
    }
  }))
}

function obtainToken(user, password) {
  return client.query(
    q.Login(q.Select("ref", user), { password }))
}

/**
 * Update the app_metadata for a netlfy user to include add the faunaDB token
 * TODO: This could be a much more generic function to allow for any arbitary
 *       data to be written to user account. Current it is very tightly coupled
 *       to the obtainToken meth
 * 
 * @param {object} key - object from obtain token
 * @param {string} usersUrl -  url of  eg "<SITE.com>/.netlify/identity/admin/users/123-abc-456"
 * @param {string} adminAuthHeader - bearer along with JWT to be passed into the 
 *                                   header of the PUT request
 */
function updateNetlifyUser (key, usersUrl, adminAuthHeader){

  try {
    return fetch(usersUrl, {
      method: "PUT",
      headers: { Authorization: adminAuthHeader },
      body: JSON.stringify({
        app_metadata: {
          faunadb_token : key.secret
          } 
        })
      })
      .then(response => response.json())
      .then(data => {
        console.log("Updated the user", data.id );
        return { data };
      })
      .catch(e => { console.error("error authorising user",e) });
  } 
  catch (e) {
      console.error("error trying to update netlify user", e)
      return e;
  }
}

function handler(event, context, callback) {

// the context of the netlify function  needs to be set to idenity
// is set when calling this function with

  const { identity, user } = context.clientContext;

  //block if user hits endpoint direclty
  if (!user) {
      return callback(null, {
      statusCode: 401,
      body: "<img src='https://media.tenor.co/images/fb288a6182d05e93d8e731cec487a0ad/tenor.gif' alt='You should'nt be here...'>"
      });
  }

  try {
    let payload = JSON.parse(event.body);
    let userData = payload.user;
    const usersUrl = `${identity.url}/admin/users/${userData.id}`;
    const adminAuthHeader = `Bearer ${identity.token}`;
  
    console.log("admin url check", usersUrl)

    const password = generator.generate({
    length: 10,
    numbers: true
    });
  
    console.log("Creating user in DB via external signup")

    createUser(userData, password)
      .then((user) => obtainToken(user, password))
      .then((key) => updateNetlifyUser(key, usersUrl, adminAuthHeader))
      .then((resp) => {
        console.log("Received response: ", resp)
        callback(null, {
          statusCode: 200, 
          body: JSON.stringify(resp)
        })
      })
      .catch((error) => {
        console.error("Unable to create a user account", error)
        callback(null, {
          statusCode: 500,
          body: JSON.stringify({
            error: error
          })
        })
      })
  }
  catch(error) {
    let errorMessage = "Cant process the given payload"
    callback(null, {
        statusCode: 418,
        body: errorMessage
      });
    console.error(errorMessage , error)
    return
  }
}

module.exports = {handler: handler};