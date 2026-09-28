import { test } from 'node:test';
import assert from 'node:assert/strict';
import { staffNavigation } from '../src/lib/staff-navigation.ts';
import { hasStaffPermission } from '../src/lib/staff-permissions.ts';

test('staff navigation preserves role restrictions and mobile has every desktop destination', () => {
  for (const staff_role of ['admin', 'manager', 'reviewer', 'preparer']) {
    const profile = { role: 'firm_staff', staff_role, is_active: true };
    const items = staffNavigation(hasStaffPermission(profile, 'audit.view'), hasStaffPermission(profile, 'team.manage'));
    const hrefs = items.map(item => item.href);
    assert.equal(hrefs.includes('/dashboard/search'), false);
    assert.equal(hrefs.includes('/dashboard/engagements'), true);
    assert.equal(hrefs.includes('/dashboard/usage'), ['admin', 'manager'].includes(staff_role));
    assert.equal(hrefs.includes('/dashboard/team'), staff_role === 'admin');
    assert.equal(hrefs.includes('/dashboard/settings'), staff_role === 'admin');
    assert.equal(new Set(hrefs).size, hrefs.length);
  }
});
