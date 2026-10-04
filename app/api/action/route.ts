import {NextResponse} from 'next/server'
import {act,Err} from '../../../lib/engine'
export async function POST(r:Request){
  try{ return NextResponse.json(await act(await r.json())) }
  catch(e:any){ const known=e instanceof Err
    return NextResponse.json({error:known?e.message:'Something went wrong. Please try again.'},{status:known?400:500}) }
}
