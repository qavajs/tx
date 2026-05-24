import * as chai from 'chai';
import { test, describe } from 'tx';

describe('External package import', () => {
  test('package import', () => {
    chai.expect(1).equal(1);
  });
});
