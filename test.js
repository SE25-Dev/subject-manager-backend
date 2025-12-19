const db = require('./models');

async function test() {
  const users = await db.User.findByPk(4);
  console.log(users); // Should show associated files
}
test();