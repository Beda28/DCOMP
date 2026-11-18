import { items }              from '../api/catalog';
import { useSession }         from '../api/session';
import Catalog                from '../components/catalog';
import FormattedInput, { formatValue } from '../components/formatted-input';
import { Help, SectionTitle } from '../components/catalog.styles';
import { Field, Input }       from '../components/ui';

const Items = () => {
  const { user } = useSession();
  const admin    = user?.role === 'ADMIN';
  return <Catalog title="품목" path="/items" api={items} canEdit={admin} canDeactivate={admin}
    summary={item => `${item.sku} · ${item.unit}`}
    values={form => ({
      sku: String(form.get('sku')).trim(), name: String(form.get('name')).trim(), unit: String(form.get('unit')).trim(),
      purchasePrice: formatValue(String(form.get('purchasePrice')), 'money').replaceAll(',', '') || null,
      salePrice: formatValue(String(form.get('salePrice')), 'money').replaceAll(',', '') || null,
    })}
    fields={item => <>
      <SectionTitle><h2>기본 정보</h2><p>SKU, 품목명, 단위는 필수입니다.</p></SectionTitle>
      <Field>SKU<Input name="sku" required maxLength={64} placeholder="예: ITEM-001" defaultValue={item?.sku ?? ''} /></Field>
      <Field>품목명<Input name="name" required maxLength={160} placeholder="품목명을 입력해주세요" defaultValue={item?.name ?? ''} /></Field>
      <Field><span>단위</span><Input name="unit" required list="item-units" maxLength={20} aria-label="단위" aria-describedby="unit-help" defaultValue={item?.unit ?? 'EA'} />
        <datalist id="item-units"><option value="EA" /><option value="BOX" /><option value="KG" /><option value="SET" /></datalist>
        <Help id="unit-help">기본값은 EA입니다. 목록에서 선택하거나 직접 입력하세요.</Help>
      </Field>
      <SectionTitle><h2>기준가</h2><p>선택 사항입니다. 실제 거래 금액은 거래 등록 시 정합니다.</p></SectionTitle>
      <Field><span>매입 기준가</span><FormattedInput name="purchasePrice" format="money" inputMode="decimal"
        aria-label="매입 기준가"
        placeholder="0.00" defaultValue={item?.purchasePrice ?? ''} /></Field>
      <Field><span>매출 기준가</span><FormattedInput name="salePrice" format="money" inputMode="decimal"
        aria-label="매출 기준가"
        placeholder="0.00" defaultValue={item?.salePrice ?? ''} /></Field>
    </>}
  />;
};

export default Items;
