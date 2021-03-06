const expect = require('chai').expect;

const getStringHash = require('../../../../packages/workbox-build/src/lib/get-string-hash');

describe(`[workbox-build] lib/get-string-hash.js`, function() {
  it(`should return the expected hashes`, function() {
    const stringsToHashes = new Map([
      ['abc', '900150983cd24fb0d6963f7d28e17f72'],
      ['xyz', 'd16fb36f0911f878998c136191af705e'],
    ]);

    for (const [string, hash] of stringsToHashes) {
      expect(getStringHash(string)).to.eql(hash);
    }
  });
});
