import { partners, type PartnerRole } from '../api/catalog';
import { useSession }   from '../api/session';
import { Choices, Help, Row, SectionTitle } from '../components/catalog.styles';
import Catalog          from '../components/catalog';
import FormattedInput, { formatValue } from '../components/formatted-input';
import { Field, Input } from '../components/ui';

const Partners = () => {
  const { user } = useSession();
  return <Catalog title="거래처" path="/partners" api={partners} canEdit canDeactivate={user?.role === 'ADMIN'} roleFilter
    summary={partner => partner.roles.map(role => role === 'CUSTOMER' ? '고객사' : '공급사').join(' / ')}
    values={form => ({
      name: String(form.get('name')).trim(), roles: form.getAll('roles') as PartnerRole[],
      bizNumber: formatValue(String(form.get('bizNumber')), 'business') || null,
      contact: formatValue(String(form.get('contact')), 'phone') || null, email: String(form.get('email')).trim() || null,
    })}
    fields={partner => <>
      <SectionTitle><h2>기본 정보</h2><p>거래처명과 거래처 역할은 필수입니다.</p></SectionTitle>
      <Field>거래처명<Input name="name" autoComplete="organization" required maxLength={160} placeholder="거래처명을 입력해주세요" defaultValue={partner?.name ?? ''} /></Field>
      <Choices><legend>거래처 역할</legend><Row>
        <label><input name="roles" type="checkbox" value="CUSTOMER" defaultChecked={partner ? partner.roles.includes('CUSTOMER') : true} /> 고객사</label>
        <label><input name="roles" type="checkbox" value="SUPPLIER" defaultChecked={partner?.roles.includes('SUPPLIER')} /> 공급사</label>
      </Row></Choices>
      <Field><span>사업자등록번호</span>
        <FormattedInput name="bizNumber" format="business" inputMode="numeric" maxLength={32}
          placeholder="123-45-67890"
          aria-label="사업자등록번호" aria-describedby="business-help" defaultValue={partner?.bizNumber ?? ''} />
        <Help id="business-help">숫자 10자리를 입력하면 구분자가 자동으로 채워집니다.</Help>
      </Field>
      <SectionTitle><h2>연락처 정보</h2><p>연락처와 이메일은 선택 사항입니다.</p></SectionTitle>
      <Field>연락처<FormattedInput name="contact" format="phone" type="tel" autoComplete="tel" maxLength={120} placeholder="010-1234-5678" defaultValue={partner?.contact ?? ''} /></Field>
      <Field>이메일<Input name="email" type="email" autoComplete="email" maxLength={254} placeholder="sales@example.com" defaultValue={partner?.email ?? ''} /></Field>
    </>}
  />;
};

export default Partners;
