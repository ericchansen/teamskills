const query = jest.fn();
const connect = jest.fn(async () => ({
  query,
  release: jest.fn(),
}));

module.exports = {
  query,
  pool: {
    connect,
  },
};
