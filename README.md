# subject-manager-backend

To run the project:

1. Copy .env.example to .env and fill in the required secret

```
$ npm install
$ cp .env.example .env
$ npm run --silent jwt-key (Put it into the .env file)
```

2. Create a database and sync the schema

```
$ node sync
```

If `NODE_ENV` is set to `development` a test user will be created. username: `testuser` password: `test`, as well as the super user will be created username: `superuser` password: `superuser` 

3. Run the server

```
node server
```
