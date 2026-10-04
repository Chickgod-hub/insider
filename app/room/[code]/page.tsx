import Game from '../../../components/Game'
export default function P({params}:{params:{code:string}}){return <Game initial={params.code}/>}
