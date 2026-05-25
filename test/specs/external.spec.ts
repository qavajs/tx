import * as chai from 'chai';
import { test } from '@qavajs/tx';

test.describe('External package import', () => {
  test('package import', () => {
    chai.expect(1).equal(1);
  });
});
