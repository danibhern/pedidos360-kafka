const {test}=require('node:test');
const assert=require('node:assert/strict');
const {makeEvent,makeMessage}=require('../scripts/carga.cjs');
const {validar}=require('../../kafka/shared/dto');
test('Diez mil eventos sintéticos válidos, cinco eventos por pedido y claves estables',()=>{
  for(let i=0;i<10000;i++){
    const e=makeEvent(i);assert.deepEqual(validar(e),[]);
    assert.equal(e.pedidoId,makeEvent(i-i%5).pedidoId);
    assert.equal(makeMessage(i).key,e.pedidoId);
    assert.equal(e.revision,i%5);
  }
});
test('Monto incorrecto y rol fuera del contrato son rechazados',()=>{
  assert.ok(validar({...makeEvent(0),total:1}).length);
  assert.ok(validar({...makeEvent(0),actor:{usuario:'x',rol:'root'}}).length);
});
