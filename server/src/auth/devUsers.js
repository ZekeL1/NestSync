const devUsers = [
  {
    id: "user-parent-1",
    email: "parent@nestjsync.local",
    password: "parent123",
    role: "parent",
    displayName: "Demo Parent"
  },
  {
    id: "user-child-1",
    email: "child@nestjsync.local",
    password: "child123",
    role: "child",
    displayName: "Demo Child"
  }
];

function findDevUserByCredentials(email, password) {
  return devUsers.find(
    (user) =>
      user.email.toLowerCase() === String(email).toLowerCase() &&
      user.password === password
  );
}

module.exports = {
  devUsers,
  findDevUserByCredentials
};
