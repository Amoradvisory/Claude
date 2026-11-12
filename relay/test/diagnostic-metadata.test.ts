import {expect,it} from 'vitest';
import {sensitiveReceipt} from '../src/capabilities';
import {projectPhoneResult} from '../src/operational-diagnostics';

it('preserves failure metadata but never screen or notification content in a sensitive receipt',()=>{
  const receipt=sensitiveReceipt('test-id',{status:'permission_required',outcome:'permission_required',proof_scope:'authorization_only',executed:false,permission:'accessibility_service',diagnosis:'android_accessibility_service_disabled',text:'private text',nodes:[{text:'private node'}],lines:['private line'],notification_body:'private body'});
  expect(receipt.permission).toBe('accessibility_service');
  expect(receipt.diagnosis).toBe('android_accessibility_service_disabled');
  expect(receipt.executed).toBe(false);
  expect(JSON.stringify(receipt)).not.toContain('private text');
  expect(JSON.stringify(receipt)).not.toContain('private node');
  expect(JSON.stringify(receipt)).not.toContain('private line');
  expect(JSON.stringify(receipt)).not.toContain('private body');
});
it('asks to inspect an authorized but unbound service instead of asking for an already granted permission',()=>{
 const result=projectPhoneResult('screen_context',{status:'permission_required',permission:'accessibility_service',executed:false,accessibility_enabled:true,accessibility_bound:false});
 expect(result.diagnosis).toBe('android_accessibility_service_unbound');
 expect(result.required_user_action).toBe('inspect_authorized_but_unbound_accessibility_service');
 expect(result.safe_to_consider_other_channel).toBe(false);
});
it('does not assert a disabled Android permission when a legacy phone reports no service metadata',()=>{
 const result=projectPhoneResult('screen_context',{status:'permission_required',permission:'accessibility_service',executed:false});
 expect(result.diagnosis).toBe('accessibility_service_unavailable');
 expect(result.required_user_action).toBe('inspect_speedcar_accessibility_in_android_settings');
});
