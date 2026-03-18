import { NextRequest, NextResponse } from 'next/server';
import Joi from 'joi';
import { v4 as uuidv4 } from 'uuid';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { saveValidation } = require('@/src/utils/database');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { addValidationJob } = require('@/src/utils/queue');

const schema = Joi.object({
  credentials: Joi.object({
    tenant_id: Joi.string().required(),
    client_id: Joi.string().required(),
    client_secret: Joi.string().required(),
    display_name: Joi.string().optional().allow(''),
  }).required(),
  subscription_id: Joi.string().required(),
});

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { error, value } = schema.validate(body);
  if (error) {
    return NextResponse.json({ error: error.details[0].message }, { status: 400 });
  }

  const { credentials, subscription_id } = value;
  const validationId = uuidv4();

  await saveValidation({
    id: validationId,
    tenant_id: credentials.tenant_id,
    client_id: credentials.client_id,
    subscription_id,
    status: 'pending',
    webhook_url: null, // global config used instead
  });

  await addValidationJob(validationId, credentials, subscription_id, {
    resource_group: 'validation-test-rg',
    location: process.env.AZURE_LOCATION || 'eastus',
    test_files: ['index.html', '404.html'],
  });

  return NextResponse.json({ validation_id: validationId, status: 'pending' }, { status: 202 });
}
