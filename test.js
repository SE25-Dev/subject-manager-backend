const db = require('./models');

async function test() {
  const material = await db.Material.findByPk(1, {
    include: [{ model: db.File, as: 'files' }]
  });
  console.log(material.files); // Should show associated files
}
test();